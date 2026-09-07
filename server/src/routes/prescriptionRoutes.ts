import { Router, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';

export const prescriptionRouter = Router();

// Doctors Directory
prescriptionRouter.get('/doctors', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const doctors = db.prepare('SELECT * FROM doctors WHERE is_active = 1 ORDER BY name ASC').all();
  res.json({ doctors });
});

prescriptionRouter.post('/doctors', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { name, specialization, clinicName, phone, email } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Doctor name is required' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO doctors (name, specialization, clinic_name, phone, email, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(name.trim(), specialization || null, clinicName || null, phone || null, email || null);

  logAudit({
    userId: req.user?.id,
    action: 'CREATE_DOCTOR',
    entity: 'DOCTORS',
    entityId: result.lastInsertRowid,
    newValues: { name: name.trim(), specialization },
    ipAddress: req.ip
  });

  res.status(201).json({ message: 'Doctor registered', doctorId: result.lastInsertRowid });
});

// List prescriptions
prescriptionRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const patientId = req.query.patientId ? Number(req.query.patientId) : undefined;

  let query = `
    SELECT 
      p.*,
      c.name as patient_name, c.mobile as patient_mobile, c.age as patient_age, c.allergy_notes,
      d.name as doctor_name, d.specialization as doctor_specialization, d.clinic_name,
      u.full_name as creator_name,
      COUNT(pi.id) as item_count
    FROM prescriptions p
    JOIN customers c ON p.patient_id = c.id
    LEFT JOIN doctors d ON p.doctor_id = d.id
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN prescription_items pi ON p.id = pi.prescription_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (patientId) {
    query += ' AND p.patient_id = ?';
    params.push(patientId);
  }

  query += ' GROUP BY p.id ORDER BY p.created_at DESC';

  const prescriptions = db.prepare(query).all(...params);
  res.json({ prescriptions });
});

// Single prescription with items
prescriptionRouter.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);

  const prescription = db.prepare(`
    SELECT 
      p.*,
      c.name as patient_name, c.mobile as patient_mobile, c.age as patient_age, c.gender as patient_gender, c.allergy_notes,
      d.name as doctor_name, d.specialization as doctor_specialization, d.clinic_name, d.phone as doctor_phone,
      u.full_name as creator_name
    FROM prescriptions p
    JOIN customers c ON p.patient_id = c.id
    LEFT JOIN doctors d ON p.doctor_id = d.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `).get(id);

  if (!prescription) {
    res.status(404).json({ error: 'Prescription not found' });
    return;
  }

  const items = db.prepare(`
    SELECT pi.*, m.brand_name, m.strength, m.dosage_form
    FROM prescription_items pi
    JOIN medicines m ON pi.medicine_id = m.id
    WHERE pi.prescription_id = ?
  `).all(id);

  res.json({ prescription, items });
});

// Create prescription
prescriptionRouter.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { patientId, doctorId, diagnosis, notes, items } = req.body;

  if (!patientId || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Patient and at least one medicine line item are required' });
    return;
  }

  try {
    const result = runTransaction(() => {
      const pResult = db.prepare(`
        INSERT INTO prescriptions (patient_id, doctor_id, diagnosis, notes, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        patientId,
        doctorId || null,
        diagnosis || null,
        notes || null,
        req.user?.id
      );

      const prescriptionId = pResult.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO prescription_items (
          prescription_id, medicine_id, dosage, frequency, duration, timing, instructions
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of items) {
        if (!it.medicineId || !it.dosage || !it.frequency) {
          throw new Error('Medicine, dosage, and frequency are required for all prescription items');
        }

        insertItem.run(
          prescriptionId,
          it.medicineId,
          it.dosage.trim(),
          it.frequency.trim(),
          it.duration ? it.duration.trim() : '5 days',
          it.timing || 'After Food',
          it.instructions || null
        );
      }

      logAudit({
        userId: req.user?.id,
        action: 'CREATE_PRESCRIPTION',
        entity: 'PRESCRIPTIONS',
        entityId: prescriptionId,
        newValues: { patientId, itemsCount: items.length },
        ipAddress: req.ip
      });

      return { prescriptionId };
    });

    res.status(201).json({ message: 'Prescription recorded successfully', prescriptionId: result.prescriptionId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
