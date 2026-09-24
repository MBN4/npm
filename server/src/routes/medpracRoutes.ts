import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import crypto from 'crypto';

export const medpracRouter = Router();
medpracRouter.use(authenticateToken);

// Helper: Format patient serial number (e.g., MP-000123)
function generatePatientSerial(): string {
  const row = db.prepare(`SELECT COUNT(*) as count FROM medprac_patients`).get() as { count: number };
  const nextNum = (row ? row.count : 0) + 1;
  return `MP-${String(nextNum).padStart(6, '0')}`;
}

// Helper: Format visit ID (e.g., MV-20260921-0001)
function generateVisitId(visitDateStr?: string): string {
  const dateObj = visitDateStr ? new Date(visitDateStr) : new Date();
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const datePrefix = `${year}${month}${day}`;

  const row = db.prepare(`
    SELECT COUNT(*) as count FROM medprac_visits 
    WHERE visit_id LIKE ?
  `).get(`MV-${datePrefix}-%`) as { count: number };

  const nextSeq = (row ? row.count : 0) + 1;
  return `MV-${datePrefix}-${String(nextSeq).padStart(4, '0')}`;
}

// 1. GET Next Patient Serial Number
medpracRouter.get('/next-serial', (req: AuthenticatedRequest, res: Response) => {
  try {
    const serial = generatePatientSerial();
    res.json({ serial_number: serial });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate serial number', details: error.message });
  }
});

// 2. GET Search Patients (by Serial, Name, Phone)
medpracRouter.get('/patients/search', (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = ((req.query.q as string) || '').trim();
    if (!q) {
      // Return recent 20 patients
      const rows = db.prepare(`
        SELECT p.*, 
          (SELECT COUNT(*) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as total_visits,
          (SELECT MAX(visit_date) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as last_visit
        FROM medprac_patients p
        ORDER BY p.id DESC
        LIMIT 20
      `).all();
      return res.json(rows);
    }

    const searchTerm = `%${q}%`;
    const rows = db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as total_visits,
        (SELECT MAX(visit_date) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as last_visit
      FROM medprac_patients p
      WHERE p.serial_number LIKE ? OR p.name LIKE ? OR p.phone LIKE ?
      ORDER BY p.id DESC
      LIMIT 30
    `).all(searchTerm, searchTerm, searchTerm);

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to search patients', details: error.message });
  }
});

// 3. POST Check Duplicate Patient
medpracRouter.post('/patients/check-duplicate', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, phone, age, sex } = req.body;
    if (!name) {
      return res.json({ possibleDuplicates: [] });
    }

    const nameTerm = `%${name.trim()}%`;
    let query = `
      SELECT p.*, 
        (SELECT COUNT(*) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as total_visits,
        (SELECT MAX(visit_date) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as last_visit
      FROM medprac_patients p
      WHERE p.name LIKE ?
    `;
    const params: any[] = [nameTerm];

    if (phone && phone.trim().length > 3) {
      query += ` OR p.phone = ?`;
      params.push(phone.trim());
    }

    const rows = db.prepare(query).all(...params) as any[];

    // Filter score
    const matches = rows.filter(p => {
      let score = 0;
      if (p.name.toLowerCase() === name.trim().toLowerCase()) score += 3;
      if (phone && p.phone === phone.trim()) score += 5;
      if (age && p.age === Number(age)) score += 1;
      if (sex && p.sex === sex) score += 1;
      return score >= 2;
    });

    res.json({ possibleDuplicates: matches });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to check duplicate patients', details: error.message });
  }
});

// 4. POST Create New Patient
medpracRouter.post('/patients', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, age, age_unit, sex, phone, address } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Patient name is required' });
    }
    if (age === undefined || age === null || isNaN(Number(age))) {
      return res.status(400).json({ error: 'Valid patient age is required' });
    }
    if (!sex || !['Male', 'Female'].includes(sex)) {
      return res.status(400).json({ error: 'Valid sex (Male/Female) is required' });
    }

    const serial_number = generatePatientSerial();
    const uuid = crypto.randomUUID();
    const ageUnitStr = age_unit || 'Years';

    const result = db.prepare(`
      INSERT INTO medprac_patients (uuid, serial_number, name, age, age_unit, sex, phone, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuid, serial_number, name.trim(), Number(age), ageUnitStr, sex, phone ? phone.trim() : null, address ? address.trim() : null);

    const newPatient = db.prepare(`SELECT * FROM medprac_patients WHERE id = ?`).get(result.lastInsertRowid) as any;

    // Log audit
    db.prepare(`
      INSERT INTO medprac_audit_logs (user_id, user_name, action, entity, entity_id, new_value)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user?.id || null,
      req.user?.fullName || 'System',
      'PATIENT_CREATED',
      'medprac_patients',
      String(newPatient.id),
      JSON.stringify(newPatient)
    );

    res.status(201).json(newPatient);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create patient', details: error.message });
  }
});

// 5. GET Patient Details & Full Visit History
medpracRouter.get('/patients/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientId = req.params.id;
    const patient = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as total_visits,
        (SELECT MIN(visit_date) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as first_visit,
        (SELECT MAX(visit_date) FROM medprac_visits v WHERE v.patient_id = p.id AND v.status != 'VOIDED') as last_visit
      FROM medprac_patients p
      WHERE p.id = ? OR p.serial_number = ?
    `).get(patientId, patientId) as any;

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const visits = db.prepare(`
      SELECT v.* 
      FROM medprac_visits v
      WHERE v.patient_id = ?
      ORDER BY v.visit_date DESC
    `).all(patient.id) as any[];

    for (const v of visits) {
      v.services = db.prepare(`SELECT * FROM medprac_visit_services WHERE visit_id = ?`).all(v.id);
      v.medicines = db.prepare(`SELECT * FROM medprac_visit_medicines WHERE visit_id = ?`).all(v.id);
      if (v.status === 'VOIDED') {
        v.reversal = db.prepare(`SELECT * FROM medprac_reversals WHERE visit_id = ?`).get(v.id);
      }
    }

    res.json({ patient, visits });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch patient history', details: error.message });
  }
});

// 6. GET Therapeutic Categories
medpracRouter.get('/categories', (req: AuthenticatedRequest, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const categories = includeInactive
      ? db.prepare(`SELECT * FROM medprac_categories ORDER BY sort_order ASC, name ASC`).all()
      : db.prepare(`SELECT * FROM medprac_categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`).all();
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch categories', details: error.message });
  }
});

// Admin Category Management: POST, PUT, DELETE
medpracRouter.post('/categories', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, icon, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name required' });
    const result = db.prepare(`
      INSERT INTO medprac_categories (name, description, icon, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(name.trim(), description || null, icon || 'activity', sort_order || 0);

    const created = db.prepare(`SELECT * FROM medprac_categories WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create category', details: error.message });
  }
});

medpracRouter.put('/categories/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, icon, sort_order, is_active } = req.body;
    db.prepare(`
      UPDATE medprac_categories 
      SET name = ?, description = ?, icon = ?, sort_order = ?, is_active = ?
      WHERE id = ?
    `).run(name, description, icon, sort_order, is_active ? 1 : 0, req.params.id);

    const updated = db.prepare(`SELECT * FROM medprac_categories WHERE id = ?`).get(req.params.id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update category', details: error.message });
  }
});

// 7. GET Practice Services
medpracRouter.get('/services', (req: AuthenticatedRequest, res: Response) => {
  try {
    const services = db.prepare(`
      SELECT * FROM medprac_services 
      WHERE is_active = 1
      ORDER BY sort_order ASC, name ASC
    `).all();
    res.json(services);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch services', details: error.message });
  }
});

medpracRouter.post('/services', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, name, default_cost, sort_order } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Service code and name required' });
    const result = db.prepare(`
      INSERT INTO medprac_services (code, name, default_cost, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(code.toLowerCase().trim(), name.trim(), Number(default_cost || 0), sort_order || 0);

    const created = db.prepare(`SELECT * FROM medprac_services WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create service', details: error.message });
  }
});

// 8. POST Record New Medprac Visit Encounter
medpracRouter.post('/visits', (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      patient_id,
      patient_serial,
      visit_date,
      therapeutic_category_id,
      therapeutic_category_name,
      dose_given,
      dose_notation,
      practice_dose_charge,
      services, // Array of { service_id, service_code, service_name, cost }
      medicines, // Array of { medicine_id, brand_name, generic_name, strength, dosage_form, quantity_used, unit_cost, selling_price, deduct_inventory }
      notes,
      medprac_by_user_id,
      medprac_by_user_name
    } = req.body;

    if (!patient_id || !patient_serial) {
      return res.status(400).json({ error: 'Patient ID and Serial Number are required' });
    }
    if (!therapeutic_category_name) {
      return res.status(400).json({ error: 'Therapeutic Category is required' });
    }
    if (!dose_given) {
      return res.status(400).json({ error: 'Dose Given is required' });
    }

    const uuid = crypto.randomUUID();
    const visit_date_val = visit_date || new Date().toISOString();
    const visit_id = generateVisitId(visit_date_val);

    const doseChargeNum = Number(practice_dose_charge || 0);

    // Calculate services total
    let servicesTotal = 0;
    const servicesList = Array.isArray(services) ? services : [];
    servicesList.forEach(s => {
      servicesTotal += Number(s.cost || 0);
    });

    // Calculate medicines total
    let medicinesTotal = 0;
    const medicinesList = Array.isArray(medicines) ? medicines : [];
    medicinesList.forEach(m => {
      const linePrice = Number(m.selling_price || 0) * Number(m.quantity_used || 1);
      medicinesTotal += linePrice;
    });

    const total_amount = doseChargeNum + servicesTotal + medicinesTotal;
    const userName = req.user?.fullName || medprac_by_user_name || 'Pharmacist';
    const userId = req.user?.id || medprac_by_user_id || 1;

    const newVisit = runTransaction(() => {
      // 1. Insert Visit Record
      const result = db.prepare(`
        INSERT INTO medprac_visits (
          uuid, visit_id, patient_id, patient_serial, visit_date,
          therapeutic_category_id, therapeutic_category_name, dose_given, dose_notation,
          practice_dose_charge, total_service_charge, total_medicine_charge, total_amount,
          notes, medprac_by_user_id, medprac_by_user_name, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
      `).run(
        uuid, visit_id, patient_id, patient_serial, visit_date_val,
        therapeutic_category_id || null, therapeutic_category_name, dose_given, dose_notation || null,
        doseChargeNum, servicesTotal, medicinesTotal, total_amount,
        notes || null, userId, userName
      );

      const insertedVisitId = result.lastInsertRowid;

      // 2. Insert Services
      const insertSvc = db.prepare(`
        INSERT INTO medprac_visit_services (visit_id, service_id, service_code, service_name, cost)
        VALUES (?, ?, ?, ?, ?)
      `);
      servicesList.forEach(s => {
        insertSvc.run(insertedVisitId, s.service_id || null, s.service_code, s.service_name, Number(s.cost || 0));
      });

      // 3. Insert Medicines & optional stock deduction
      const insertMed = db.prepare(`
        INSERT INTO medprac_visit_medicines (
          visit_id, medicine_id, brand_name, generic_name, strength, dosage_form,
          quantity_used, batch_number, expiry_date, unit_cost, selling_price, total_price, inventory_deducted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertBatchDeduction = db.prepare(`
        INSERT INTO medprac_medicine_batch_deductions (visit_medicine_id, batch_id, quantity)
        VALUES (?, ?, ?)
      `);

      medicinesList.forEach(m => {
        const lineTotal = Number(m.selling_price || 0) * Number(m.quantity_used || 1);
        let deducted = 0;
        const deductions: { batchId: number; quantity: number }[] = [];

        if (m.deduct_inventory && m.medicine_id) {
          // Deduct stock using FEFO from active, non-expired batches
          const qtyNeeded = Number(m.quantity_used || 1);
          const batches = db.prepare(`
            SELECT * FROM batches
            WHERE medicine_id = ? AND quantity > 0 AND status = 'ACTIVE' AND expiry_date > date('now')
            ORDER BY expiry_date ASC
          `).all(m.medicine_id) as any[];

          let remaining = qtyNeeded;
          for (const b of batches) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, b.quantity);
            db.prepare(`UPDATE batches SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(take, b.id);
            deductions.push({ batchId: b.id, quantity: take });
            remaining -= take;
          }
          if (deductions.length > 0) deducted = 1;
        }

        const medResult = insertMed.run(
          insertedVisitId,
          m.medicine_id || null,
          m.brand_name,
          m.generic_name || null,
          m.strength || null,
          m.dosage_form || null,
          Number(m.quantity_used || 1),
          m.batch_number || null,
          m.expiry_date || null,
          Number(m.unit_cost || 0),
          Number(m.selling_price || 0),
          lineTotal,
          deducted
        );

        const visitMedicineId = medResult.lastInsertRowid;
        deductions.forEach(d => insertBatchDeduction.run(visitMedicineId, d.batchId, d.quantity));
      });

      // 4. Record Audit Log
      db.prepare(`
        INSERT INTO medprac_audit_logs (user_id, user_name, action, entity, entity_id, new_value)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId, userName, 'VISIT_CREATED', 'medprac_visits', String(insertedVisitId), JSON.stringify({ visit_id, total_amount, patient_serial }));

      return db.prepare(`SELECT * FROM medprac_visits WHERE id = ?`).get(insertedVisitId) as any;
    });

    // Attach services & medicines to response
    newVisit.services = db.prepare(`SELECT * FROM medprac_visit_services WHERE visit_id = ?`).all(newVisit.id);
    newVisit.medicines = db.prepare(`SELECT * FROM medprac_visit_medicines WHERE visit_id = ?`).all(newVisit.id);
    newVisit.patient = db.prepare(`SELECT * FROM medprac_patients WHERE id = ?`).get(newVisit.patient_id);

    res.status(201).json(newVisit);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to record Medprac visit', details: error.message });
  }
});

// 9. GET Recent Visits (with Filters)
medpracRouter.get('/visits', (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = (page - 1) * limit;

    const search = ((req.query.search as string) || '').trim();
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const category = req.query.category as string;
    const dose = req.query.dose as string;
    const serviceCode = req.query.service as string;
    const userId = req.query.userId as string;

    let query = `
      SELECT v.*, p.name as patient_name, p.age as patient_age, p.age_unit as patient_age_unit, p.sex as patient_sex, p.phone as patient_phone
      FROM medprac_visits v
      JOIN medprac_patients p ON v.patient_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      const term = `%${search}%`;
      query += ` AND (v.visit_id LIKE ? OR v.patient_serial LIKE ? OR p.name LIKE ? OR p.phone LIKE ?)`;
      params.push(term, term, term, term);
    }

    if (startDate) {
      query += ` AND DATE(v.visit_date) >= DATE(?)`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND DATE(v.visit_date) <= DATE(?)`;
      params.push(endDate);
    }
    if (category) {
      query += ` AND (v.therapeutic_category_name = ? OR v.therapeutic_category_id = ?)`;
      params.push(category, category);
    }
    if (dose) {
      query += ` AND v.dose_given = ?`;
      params.push(dose);
    }
    if (userId) {
      query += ` AND v.medprac_by_user_id = ?`;
      params.push(userId);
    }
    if (serviceCode) {
      query += ` AND EXISTS (SELECT 1 FROM medprac_visit_services vs WHERE vs.visit_id = v.id AND vs.service_code = ?)`;
      params.push(serviceCode);
    }

    // Count query
    const countSql = query.replace('SELECT v.*, p.name as patient_name, p.age as patient_age, p.age_unit as patient_age_unit, p.sex as patient_sex, p.phone as patient_phone', 'SELECT COUNT(*) as total');
    const totalRow = db.prepare(countSql).get(...params) as { total: number };

    query += ` ORDER BY v.visit_date DESC, v.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const visits = db.prepare(query).all(...params) as any[];

    for (const v of visits) {
      v.services = db.prepare(`SELECT * FROM medprac_visit_services WHERE visit_id = ?`).all(v.id);
      v.medicines = db.prepare(`SELECT * FROM medprac_visit_medicines WHERE visit_id = ?`).all(v.id);
    }

    res.json({
      visits,
      pagination: {
        page,
        limit,
        total: totalRow.total,
        totalPages: Math.ceil(totalRow.total / limit)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch visits', details: error.message });
  }
});

// 10. GET Single Visit Detail
medpracRouter.get('/visits/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const visitId = req.params.id;
    const visit = db.prepare(`
      SELECT v.*, p.name as patient_name, p.age as patient_age, p.age_unit as patient_age_unit, p.sex as patient_sex, p.phone as patient_phone, p.address as patient_address
      FROM medprac_visits v
      JOIN medprac_patients p ON v.patient_id = p.id
      WHERE v.id = ? OR v.visit_id = ?
    `).get(visitId, visitId) as any;

    if (!visit) {
      return res.status(404).json({ error: 'Visit record not found' });
    }

    visit.services = db.prepare(`SELECT * FROM medprac_visit_services WHERE visit_id = ?`).all(visit.id);
    visit.medicines = db.prepare(`SELECT * FROM medprac_visit_medicines WHERE visit_id = ?`).all(visit.id);
    if (visit.status === 'VOIDED') {
      visit.reversal = db.prepare(`SELECT * FROM medprac_reversals WHERE visit_id = ?`).get(visit.id);
    }

    res.json(visit);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch visit detail', details: error.message });
  }
});

// 11. POST Reversal / Void Visit
medpracRouter.post('/visits/:id/void', (req: AuthenticatedRequest, res: Response) => {
  try {
    const visitId = req.params.id;
    const { reason, reversed_by_user_id, reversed_by_user_name } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'Reversal reason is required' });
    }

    const visit = db.prepare(`SELECT * FROM medprac_visits WHERE id = ? OR visit_id = ?`).get(visitId, visitId) as any;
    if (!visit) {
      return res.status(404).json({ error: 'Visit record not found' });
    }
    if (visit.status === 'VOIDED') {
      return res.status(400).json({ error: 'Visit is already voided/reversed' });
    }

    const userId = req.user?.id || reversed_by_user_id || 1;
    const userName = req.user?.fullName || reversed_by_user_name || 'Pharmacist';

    runTransaction(() => {
      // Mark as voided
      db.prepare(`UPDATE medprac_visits SET status = 'VOIDED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(visit.id);

      // Save reversal audit
      db.prepare(`
        INSERT INTO medprac_reversals (visit_id, reason, reversed_by_user_id, reversed_by_user_name, original_amount, reversed_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(visit.id, reason.trim(), userId, userName, visit.total_amount, visit.total_amount);

      // Restore inventory to the exact batch(es) it was deducted from
      const deductedMeds = db.prepare(`SELECT * FROM medprac_visit_medicines WHERE visit_id = ? AND inventory_deducted = 1`).all(visit.id) as any[];
      for (const m of deductedMeds) {
        const deductions = db.prepare(`SELECT * FROM medprac_medicine_batch_deductions WHERE visit_medicine_id = ?`).all(m.id) as any[];
        for (const d of deductions) {
          db.prepare(`UPDATE batches SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(d.quantity, d.batch_id);
        }
      }

      // Record Audit Log
      db.prepare(`
        INSERT INTO medprac_audit_logs (user_id, user_name, action, entity, entity_id, old_value, new_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId, userName, 'VISIT_VOIDED', 'medprac_visits', String(visit.id),
        JSON.stringify({ status: 'COMPLETED', total_amount: visit.total_amount }),
        JSON.stringify({ status: 'VOIDED', reason })
      );
    });

    res.json({ message: 'Visit successfully voided/reversed', visit_id: visit.visit_id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to void visit', details: error.message });
  }
});

// 12. GET Medprac Reports & Revenue Analytics
medpracRouter.get('/reports', (req: AuthenticatedRequest, res: Response) => {
  try {
    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || new Date().toISOString().split('T')[0];

    // Revenue metrics
    const revenueRow = db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(practice_dose_charge), 0) as total_dose_revenue,
        COALESCE(SUM(total_service_charge), 0) as total_service_revenue,
        COALESCE(SUM(total_medicine_charge), 0) as total_medicine_revenue,
        COUNT(*) as total_visits,
        COUNT(DISTINCT patient_id) as unique_patients
      FROM medprac_visits
      WHERE status != 'VOIDED' AND DATE(visit_date) BETWEEN DATE(?) AND DATE(?)
    `).get(startDate, endDate) as any;

    // Dose breakdown
    const doseStats = db.prepare(`
      SELECT dose_given, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
      FROM medprac_visits
      WHERE status != 'VOIDED' AND DATE(visit_date) BETWEEN DATE(?) AND DATE(?)
      GROUP BY dose_given
    `).all(startDate, endDate) as any[];

    // Service breakdown
    const serviceStats = db.prepare(`
      SELECT vs.service_name, vs.service_code, COUNT(*) as count, COALESCE(SUM(vs.cost), 0) as revenue
      FROM medprac_visit_services vs
      JOIN medprac_visits v ON vs.visit_id = v.id
      WHERE v.status != 'VOIDED' AND DATE(v.visit_date) BETWEEN DATE(?) AND DATE(?)
      GROUP BY vs.service_code
      ORDER BY count DESC
    `).all(startDate, endDate) as any[];

    // Category breakdown
    const categoryStats = db.prepare(`
      SELECT v.therapeutic_category_name as category_name, COUNT(*) as count, COALESCE(SUM(v.total_amount), 0) as revenue
      FROM medprac_visits v
      WHERE v.status != 'VOIDED' AND DATE(v.visit_date) BETWEEN DATE(?) AND DATE(?)
      GROUP BY v.therapeutic_category_name
      ORDER BY count DESC
    `).all(startDate, endDate) as any[];

    // New vs Repeat patients
    const newPatientsRow = db.prepare(`
      SELECT COUNT(*) as new_patients_count
      FROM medprac_patients
      WHERE DATE(created_at) BETWEEN DATE(?) AND DATE(?)
    `).get(startDate, endDate) as any;

    const repeatPatientsCount = Math.max(0, (revenueRow.unique_patients || 0) - (newPatientsRow.new_patients_count || 0));

    // Staff practice breakdown
    const staffStats = db.prepare(`
      SELECT medprac_by_user_name as user_name, COUNT(*) as visits_count, COALESCE(SUM(total_amount), 0) as revenue
      FROM medprac_visits
      WHERE status != 'VOIDED' AND DATE(visit_date) BETWEEN DATE(?) AND DATE(?)
      GROUP BY medprac_by_user_id
      ORDER BY revenue DESC
    `).all(startDate, endDate) as any[];

    const avgPerVisit = revenueRow.total_visits > 0 ? (revenueRow.total_revenue / revenueRow.total_visits) : 0;

    res.json({
      startDate,
      endDate,
      summary: {
        total_revenue: revenueRow.total_revenue,
        total_dose_revenue: revenueRow.total_dose_revenue,
        total_service_revenue: revenueRow.total_service_revenue,
        total_medicine_revenue: revenueRow.total_medicine_revenue,
        total_visits: revenueRow.total_visits,
        unique_patients: revenueRow.unique_patients,
        new_patients: newPatientsRow.new_patients_count || 0,
        repeat_patients: repeatPatientsCount,
        avg_per_visit: Math.round(avgPerVisit * 100) / 100
      },
      dose_breakdown: doseStats,
      service_breakdown: serviceStats,
      category_breakdown: categoryStats,
      staff_breakdown: staffStats
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate Medprac reports', details: error.message });
  }
});

// 13. GET Dashboard Summary KPIs (Today)
medpracRouter.get('/dashboard', (req: AuthenticatedRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const todayVisits = db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as today_revenue,
        COUNT(*) as total_visits,
        COUNT(DISTINCT patient_id) as total_patients
      FROM medprac_visits
      WHERE status != 'VOIDED' AND DATE(visit_date) = DATE(?)
    `).get(today) as any;

    const newPatientsToday = db.prepare(`
      SELECT COUNT(*) as count FROM medprac_patients WHERE DATE(created_at) = DATE(?)
    `).get(today) as { count: number };

    const repeatPatientsToday = Math.max(0, (todayVisits.total_patients || 0) - (newPatientsToday.count || 0));

    // Service counts
    const getServiceCount = (code: string) => {
      const row = db.prepare(`
        SELECT COUNT(*) as count 
        FROM medprac_visit_services vs
        JOIN medprac_visits v ON vs.visit_id = v.id
        WHERE v.status != 'VOIDED' AND DATE(v.visit_date) = DATE(?) AND vs.service_code = ?
      `).get(today, code) as { count: number };
      return row ? row.count : 0;
    };

    const injectionsCount = getServiceCount('injection');
    const ivCount = getServiceCount('iv');
    const dripsCount = getServiceCount('drip');

    const avgPerVisit = todayVisits.total_visits > 0 ? (todayVisits.today_revenue / todayVisits.total_visits) : 0;

    res.json({
      todays_practice_revenue: todayVisits.today_revenue || 0,
      todays_patients: todayVisits.total_patients || 0,
      new_patients: newPatientsToday.count || 0,
      repeat_patients: repeatPatientsToday,
      injections_count: injectionsCount,
      iv_count: ivCount,
      drips_count: dripsCount,
      avg_per_visit: Math.round(avgPerVisit * 100) / 100
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch Medprac dashboard KPIs', details: error.message });
  }
});

// 14. GET Audit Logs
medpracRouter.get('/audit-logs', (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM medprac_audit_logs 
      ORDER BY id DESC LIMIT 100
    `).all();
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch audit logs', details: error.message });
  }
});
