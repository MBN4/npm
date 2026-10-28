import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { triggerAutoSync } from '../services/gitSyncService.js';
import { safeJsonParse } from '../utils/json.js';

export const prescriptionRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ATTACHMENTS_ROOT = path.resolve(__dirname, '../../data/attachments/prescriptions');
if (!fs.existsSync(ATTACHMENTS_ROOT)) fs.mkdirSync(ATTACHMENTS_ROOT, { recursive: true });

const ALLOWED_ATTACHMENT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(ATTACHMENTS_ROOT, String(req.params.id));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
      cb(null, `${Date.now()}${safeExt}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WEBP or PDF prescription attachments are allowed'));
      return;
    }
    cb(null, true);
  }
});

// Doctors Directory
prescriptionRouter.get('/doctors', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const doctors = db.prepare('SELECT * FROM doctors WHERE is_active = 1 ORDER BY name ASC').all();
  res.json({ doctors });
});

// Fixed clinic provider directory (Dr. Yasir Iqbal, Dr. Abdul Waris Khan PT, Dr. Abdul Rehman, Chief Abdul Wajid)
prescriptionRouter.get('/providers', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const providers = db.prepare('SELECT * FROM clinic_providers WHERE is_active = 1 ORDER BY sort_order ASC').all();
  res.json({ providers });
});

const TEMPLATE_SECTIONS = new Set(['clinical_notes', 'diagnosis', 'advice', 'treatment', 'summary', 'referral_reason']);

// Category tags + any saved reusable snippets for a section (diagnosis/advice/treatment/summary/referral_reason/clinical_notes).
// Selecting a category here is purely informational on the client - it never inserts text by itself.
prescriptionRouter.get('/templates', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const section = String(req.query.section || '');
  if (!TEMPLATE_SECTIONS.has(section)) {
    res.status(400).json({ error: `section must be one of: ${[...TEMPLATE_SECTIONS].join(', ')}` });
    return;
  }
  const templates = db.prepare('SELECT * FROM clinical_templates WHERE section = ? AND is_active = 1 ORDER BY category ASC, id ASC').all(section);
  res.json({ templates });
});

// Authorised template/category management (add a category or a reusable snippet of text within one)
prescriptionRouter.post('/templates', authenticateToken, requirePermission('manage_settings'), (req: AuthenticatedRequest, res: Response) => {
  const { section, category, templateText } = req.body;
  if (!TEMPLATE_SECTIONS.has(section)) {
    res.status(400).json({ error: `section must be one of: ${[...TEMPLATE_SECTIONS].join(', ')}` });
    return;
  }
  if (!category || !String(category).trim()) {
    res.status(400).json({ error: 'Category is required' });
    return;
  }
  const result = db.prepare('INSERT INTO clinical_templates (section, category, template_text, created_by) VALUES (?, ?, ?, ?)')
    .run(section, String(category).trim(), templateText ? String(templateText).trim() : null, req.user?.id);
  logAudit({ userId: req.user?.id, action: 'CREATE_CLINICAL_TEMPLATE', entity: 'CLINICAL_TEMPLATES', entityId: Number(result.lastInsertRowid), newValues: { section, category, templateText }, ipAddress: req.ip });
  res.status(201).json({ message: 'Template saved', templateId: result.lastInsertRowid });
});

prescriptionRouter.delete('/templates/:id', authenticateToken, requirePermission('manage_settings'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM clinical_templates WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  db.prepare('UPDATE clinical_templates SET is_active = 0 WHERE id = ?').run(id);
  logAudit({ userId: req.user?.id, action: 'DEACTIVATE_CLINICAL_TEMPLATE', entity: 'CLINICAL_TEMPLATES', entityId: id, oldValues: existing, ipAddress: req.ip });
  res.json({ message: 'Template removed' });
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
    entityId: Number(result.lastInsertRowid),
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
      cp.name as provider_name, cp.credentials as provider_credentials, cp.designation as provider_designation, cp.hospital as provider_hospital,
      u.full_name as creator_name,
      COUNT(DISTINCT pi.id) as item_count,
      COUNT(DISTINCT pr.id) as has_referral
    FROM prescriptions p
    JOIN customers c ON p.patient_id = c.id
    LEFT JOIN doctors d ON p.doctor_id = d.id
    LEFT JOIN clinic_providers cp ON p.provider_id = cp.id
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN prescription_items pi ON p.id = pi.prescription_id
    LEFT JOIN prescription_referrals pr ON p.id = pr.prescription_id
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

// Single prescription with items, investigations, and referral
prescriptionRouter.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);

  const prescription = db.prepare(`
    SELECT
      p.*,
      c.name as patient_name, c.mobile as patient_mobile, c.age as patient_age, c.gender as patient_gender, c.allergy_notes,
      d.name as doctor_name, d.specialization as doctor_specialization, d.clinic_name, d.phone as doctor_phone,
      cp.name as provider_name, cp.credentials as provider_credentials, cp.designation as provider_designation, cp.hospital as provider_hospital,
      u.full_name as creator_name
    FROM prescriptions p
    JOIN customers c ON p.patient_id = c.id
    LEFT JOIN doctors d ON p.doctor_id = d.id
    LEFT JOIN clinic_providers cp ON p.provider_id = cp.id
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `).get(id);

  if (!prescription) {
    res.status(404).json({ error: 'Prescription not found' });
    return;
  }

  const items = db.prepare(`
    SELECT pi.*, m.brand_name, m.strength as catalog_strength, m.dosage_form, g.name as catalog_generic_name
    FROM prescription_items pi
    LEFT JOIN medicines m ON pi.medicine_id = m.id
    LEFT JOIN generics g ON m.generic_id = g.id
    WHERE pi.prescription_id = ?
  `).all(id);

  const investigations = db.prepare('SELECT * FROM prescription_investigations WHERE prescription_id = ?').all(id);
  const diagnoses = db.prepare('SELECT * FROM prescription_diagnoses WHERE prescription_id = ?').all(id);
  const referralRow = db.prepare('SELECT * FROM prescription_referrals WHERE prescription_id = ?').get(id) as any;
  const referral = referralRow
    ? { ...referralRow, reason_categories: safeJsonParse(referralRow.reason_categories, []), summary_categories: safeJsonParse(referralRow.summary_categories, []) }
    : null;

  const p = prescription as any;
  p.advice_categories = safeJsonParse(p.advice_categories, []);
  p.treatment_categories = safeJsonParse(p.treatment_categories, []);

  res.json({ prescription, items, investigations, diagnoses, referral });
});

// Parses an optional numeric field: '' / null / undefined -> null (never 0), otherwise a validated number.
function parseOptionalNumber(value: any, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error(`${label} must be a number`);
  return n;
}

function insertItems(prescriptionId: number | bigint, items: any[]) {
  const insertItem = db.prepare(`
    INSERT INTO prescription_items (
      prescription_id, medicine_id, medicine_name, generic_name, strength, route,
      dosage, frequency, duration, timing, instructions, authorized_quantity, unit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const it of items || []) {
    const medicineId = it.medicineId ? Number(it.medicineId) : null;
    const medicineName = (it.medicineName || '').trim() || null;
    const strength = (it.strength || '').trim();
    // A row's identity is its medicine (id/name) or a manually-entered strength - dosage/frequency carry
    // UI convenience defaults (e.g. "1 Tablet"/"BD") even on an untouched row, so they can't be used to
    // tell a genuinely empty row from a filled one. No medicine identity at all -> silently skip the row.
    if (!medicineId && !medicineName && !strength) continue;

    if (!medicineId && !medicineName) {
      throw new Error('Each medicine row needs at least a medicine name (catalogue or manual entry)');
    }

    insertItem.run(
      prescriptionId,
      medicineId,
      medicineName,
      (it.genericName || '').trim() || null,
      strength || null,
      (it.route || '').trim() || null,
      (it.dosage || '').trim() || null,
      (it.frequency || '').trim() || null,
      (it.duration || '').trim() || null,
      (it.timing || '').trim() || null,
      (it.instructions || '').trim() || null,
      it.authorizedQuantity !== undefined && it.authorizedQuantity !== null && it.authorizedQuantity !== '' ? Number(it.authorizedQuantity) : null,
      it.unit || null
    );
  }
}

function insertInvestigations(prescriptionId: number | bigint, investigations: any[]) {
  const insertInv = db.prepare(`
    INSERT INTO prescription_investigations (prescription_id, test_name, is_custom, instructions)
    VALUES (?, ?, ?, ?)
  `);
  for (const inv of investigations || []) {
    const testName = (inv.testName || '').trim();
    if (!testName) continue;
    insertInv.run(prescriptionId, testName, inv.isCustom ? 1 : 0, (inv.instructions || '').trim() || null);
  }
}

function upsertReferral(prescriptionId: number | bigint, referral: any) {
  if (!referral) return;
  const hasContent = ['hospitalName', 'department', 'specialistName', 'reason', 'clinicalSummary', 'reportsAttached']
    .some(k => (referral[k] || '').toString().trim());
  if (!hasContent) return; // never create an "active" referral from an empty/default-only form section

  const priority = ['Routine', 'Urgent', 'Emergency'].includes(referral.priority) ? referral.priority : 'Routine';
  db.prepare(`
    INSERT INTO prescription_referrals (prescription_id, hospital_name, department, specialist_name, reason, reason_categories, priority, clinical_summary, summary_categories, reports_attached)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    prescriptionId,
    (referral.hospitalName || '').trim() || null,
    (referral.department || '').trim() || null,
    (referral.specialistName || '').trim() || null,
    (referral.reason || '').trim() || null,
    Array.isArray(referral.reasonCategories) && referral.reasonCategories.length ? JSON.stringify(referral.reasonCategories) : null,
    priority,
    (referral.clinicalSummary || '').trim() || null,
    Array.isArray(referral.summaryCategories) && referral.summaryCategories.length ? JSON.stringify(referral.summaryCategories) : null,
    (referral.reportsAttached || '').trim() || null
  );
}

function insertDiagnoses(prescriptionId: number | bigint, diagnoses: any[]) {
  const insertDx = db.prepare(`
    INSERT INTO prescription_diagnoses (prescription_id, category, diagnosis_text, status, is_custom)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const dx of diagnoses || []) {
    const text = (dx.diagnosisText || '').trim();
    if (!text) continue; // ignore completely empty rows
    const status = dx.status === 'Confirmed' ? 'Confirmed' : 'Provisional';
    insertDx.run(prescriptionId, (dx.category || '').trim() || null, text, status, dx.isCustom ? 1 : 0);
  }
}

// Create prescription
prescriptionRouter.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const {
    patientId, doctorId, providerId, visitDate, ageYears, ageMonths,
    diagnosis, diagnoses, notes,
    clinicalNotes, presentingComplaint, historyPresentIllness, relevantMedicalHistory,
    examinationFindings, allergiesNotes, currentMedicinesNotes,
    clinicalAdvice, adviceCategories, treatmentPlan, treatmentCategories,
    followUpDate, followUpInstructions,
    pulseBpm, bpSystolic, bpDiastolic, spo2Percent, randomSugar, fastingSugar, weightKg, temperatureValue, temperatureUnit,
    items, investigations, referral, requestKey,
    purchaserName, purchaserRelation, purchaserCnic, purchaserMobile,
    patientCnic, patientMobile, patientAddress,
    prescriberRegistrationNumber, prescriberAddress, originalDocumentReference
  } = req.body;

  if (!patientId) {
    res.status(400).json({ error: 'Patient is required' });
    return;
  }

  // The legacy single diagnosis column stays in sync as a joined summary (for list views / older
  // clients); the structured, multi-diagnosis detail lives in prescription_diagnoses.
  const diagnosisSummary = Array.isArray(diagnoses) && diagnoses.length
    ? diagnoses.map((d: any) => (d.diagnosisText || '').trim()).filter(Boolean).join(', ')
    : (diagnosis || null);

  // Idempotency: a repeated click with the same requestKey returns the already-saved record instead of duplicating it.
  if (requestKey) {
    const existing = db.prepare('SELECT id FROM prescriptions WHERE request_key = ?').get(requestKey) as { id: number } | undefined;
    if (existing) {
      res.status(200).json({ message: 'Prescription already recorded', prescriptionId: existing.id });
      return;
    }
  }

  try {
    let vitals: Record<string, number | null>;
    try {
      vitals = {
        pulseBpm: parseOptionalNumber(pulseBpm, 'Pulse'),
        bpSystolic: parseOptionalNumber(bpSystolic, 'BP systolic'),
        bpDiastolic: parseOptionalNumber(bpDiastolic, 'BP diastolic'),
        spo2Percent: parseOptionalNumber(spo2Percent, 'SpO2'),
        randomSugar: parseOptionalNumber(randomSugar, 'Random blood sugar'),
        fastingSugar: parseOptionalNumber(fastingSugar, 'Fasting blood sugar'),
        weightKg: parseOptionalNumber(weightKg, 'Weight'),
        temperatureValue: parseOptionalNumber(temperatureValue, 'Temperature'),
        ageYears: parseOptionalNumber(ageYears, 'Age (years)'),
        ageMonths: parseOptionalNumber(ageMonths, 'Age (months)')
      };
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    const result = runTransaction(() => {
      const pResult = db.prepare(`
        INSERT INTO prescriptions (
          patient_id, doctor_id, provider_id, visit_date, age_years, age_months,
          diagnosis, notes, clinical_notes,
          presenting_complaint, history_present_illness, relevant_medical_history,
          examination_findings, allergies_notes, current_medicines_notes,
          clinical_advice, advice_categories, treatment_plan, treatment_categories,
          follow_up_date, follow_up_instructions,
          pulse_bpm, bp_systolic, bp_diastolic, spo2_percent, random_sugar_mgdl, fasting_sugar_mgdl, weight_kg, temperature_value, temperature_unit,
          request_key, created_by,
          purchaser_name, purchaser_relation, purchaser_cnic, purchaser_mobile,
          patient_cnic, patient_mobile, patient_address,
          prescriber_registration_number, prescriber_address, original_document_reference,
          review_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        patientId, doctorId || null, providerId || null, visitDate || null, vitals.ageYears, vitals.ageMonths,
        diagnosisSummary, notes || null, clinicalNotes || null,
        presentingComplaint || null, historyPresentIllness || null, relevantMedicalHistory || null,
        examinationFindings || null, allergiesNotes || null, currentMedicinesNotes || null,
        clinicalAdvice || null, Array.isArray(adviceCategories) && adviceCategories.length ? JSON.stringify(adviceCategories) : null,
        treatmentPlan || null, Array.isArray(treatmentCategories) && treatmentCategories.length ? JSON.stringify(treatmentCategories) : null,
        followUpDate || null, followUpInstructions || null,
        vitals.pulseBpm, vitals.bpSystolic, vitals.bpDiastolic, vitals.spo2Percent, vitals.randomSugar, vitals.fastingSugar, vitals.weightKg, vitals.temperatureValue, temperatureUnit || null,
        requestKey || null, req.user?.id,
        purchaserName || null, purchaserRelation || null, purchaserCnic || null, purchaserMobile || null,
        patientCnic || null, patientMobile || null, patientAddress || null,
        prescriberRegistrationNumber || null, prescriberAddress || null, originalDocumentReference || null
      );

      const prescriptionId = pResult.lastInsertRowid;
      insertItems(prescriptionId, items);
      insertInvestigations(prescriptionId, investigations);
      upsertReferral(prescriptionId, referral);
      insertDiagnoses(prescriptionId, diagnoses);

      logAudit({
        userId: req.user?.id,
        action: 'CREATE_PRESCRIPTION',
        entity: 'PRESCRIPTIONS',
        entityId: Number(prescriptionId),
        newValues: { patientId, itemsCount: (items || []).length },
        ipAddress: req.ip
      });

      return { prescriptionId };
    });

    triggerAutoSync(`prescription ${result.prescriptionId}`);
    res.status(201).json({ message: 'Prescription recorded successfully', prescriptionId: result.prescriptionId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Edit an existing prescription (full replace of items/investigations/referral, same validation as create)
prescriptionRouter.put('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM prescriptions WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Prescription not found' });
    return;
  }

  const {
    doctorId, providerId, visitDate, ageYears, ageMonths,
    diagnosis, diagnoses, notes,
    clinicalNotes, presentingComplaint, historyPresentIllness, relevantMedicalHistory,
    examinationFindings, allergiesNotes, currentMedicinesNotes,
    clinicalAdvice, adviceCategories, treatmentPlan, treatmentCategories,
    followUpDate, followUpInstructions,
    pulseBpm, bpSystolic, bpDiastolic, spo2Percent, randomSugar, fastingSugar, weightKg, temperatureValue, temperatureUnit,
    items, investigations, referral
  } = req.body;

  const diagnosisSummary = Array.isArray(diagnoses) && diagnoses.length
    ? diagnoses.map((d: any) => (d.diagnosisText || '').trim()).filter(Boolean).join(', ')
    : (diagnosis || null);

  try {
    let vitals: Record<string, number | null>;
    try {
      vitals = {
        pulseBpm: parseOptionalNumber(pulseBpm, 'Pulse'),
        bpSystolic: parseOptionalNumber(bpSystolic, 'BP systolic'),
        bpDiastolic: parseOptionalNumber(bpDiastolic, 'BP diastolic'),
        spo2Percent: parseOptionalNumber(spo2Percent, 'SpO2'),
        randomSugar: parseOptionalNumber(randomSugar, 'Random blood sugar'),
        fastingSugar: parseOptionalNumber(fastingSugar, 'Fasting blood sugar'),
        weightKg: parseOptionalNumber(weightKg, 'Weight'),
        temperatureValue: parseOptionalNumber(temperatureValue, 'Temperature'),
        ageYears: parseOptionalNumber(ageYears, 'Age (years)'),
        ageMonths: parseOptionalNumber(ageMonths, 'Age (months)')
      };
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    runTransaction(() => {
      db.prepare(`
        UPDATE prescriptions SET
          doctor_id = ?, provider_id = ?, visit_date = ?, age_years = ?, age_months = ?,
          diagnosis = ?, notes = ?, clinical_notes = ?,
          presenting_complaint = ?, history_present_illness = ?, relevant_medical_history = ?,
          examination_findings = ?, allergies_notes = ?, current_medicines_notes = ?,
          clinical_advice = ?, advice_categories = ?, treatment_plan = ?, treatment_categories = ?,
          follow_up_date = ?, follow_up_instructions = ?,
          pulse_bpm = ?, bp_systolic = ?, bp_diastolic = ?, spo2_percent = ?, random_sugar_mgdl = ?, fasting_sugar_mgdl = ?, weight_kg = ?, temperature_value = ?, temperature_unit = ?,
          updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        doctorId || null, providerId || null, visitDate || null, vitals.ageYears, vitals.ageMonths,
        diagnosisSummary, notes || null, clinicalNotes || null,
        presentingComplaint || null, historyPresentIllness || null, relevantMedicalHistory || null,
        examinationFindings || null, allergiesNotes || null, currentMedicinesNotes || null,
        clinicalAdvice || null, Array.isArray(adviceCategories) && adviceCategories.length ? JSON.stringify(adviceCategories) : null,
        treatmentPlan || null, Array.isArray(treatmentCategories) && treatmentCategories.length ? JSON.stringify(treatmentCategories) : null,
        followUpDate || null, followUpInstructions || null,
        vitals.pulseBpm, vitals.bpSystolic, vitals.bpDiastolic, vitals.spo2Percent, vitals.randomSugar, vitals.fastingSugar, vitals.weightKg, vitals.temperatureValue, temperatureUnit || null,
        req.user?.id, id
      );

      db.prepare('DELETE FROM prescription_items WHERE prescription_id = ?').run(id);
      db.prepare('DELETE FROM prescription_investigations WHERE prescription_id = ?').run(id);
      db.prepare('DELETE FROM prescription_referrals WHERE prescription_id = ?').run(id);
      db.prepare('DELETE FROM prescription_diagnoses WHERE prescription_id = ?').run(id);

      insertItems(id, items);
      insertInvestigations(id, investigations);
      upsertReferral(id, referral);
      insertDiagnoses(id, diagnoses);

      logAudit({
        userId: req.user?.id,
        action: 'UPDATE_PRESCRIPTION',
        entity: 'PRESCRIPTIONS',
        entityId: id,
        ipAddress: req.ip
      });
    });

    triggerAutoSync(`prescription ${id} updated`);
    res.json({ message: 'Prescription updated successfully', prescriptionId: id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Pharmacist review workflow (approve/reject with comments)
prescriptionRouter.post('/:id/review', authenticateToken, requirePermission('manage_patients'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const { reviewStatus, reviewComments } = req.body;
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(reviewStatus)) {
    res.status(400).json({ error: 'reviewStatus must be PENDING, APPROVED or REJECTED' });
    return;
  }

  const before = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id);
  if (!before) {
    res.status(404).json({ error: 'Prescription not found' });
    return;
  }

  db.prepare(`
    UPDATE prescriptions SET review_status = ?, review_comments = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(reviewStatus, reviewComments || null, req.user!.id, id);

  logAudit({
    userId: req.user?.id, action: 'REVIEW_PRESCRIPTION', entity: 'PRESCRIPTIONS', entityId: id,
    oldValues: before, newValues: { reviewStatus, reviewComments }, ipAddress: req.ip
  });

  res.json({ message: `Prescription marked ${reviewStatus}` });
});

// Upload a prescription attachment (image/scan/PDF). Restricted to authenticated staff with patient-management access.
prescriptionRouter.post('/:id/attachment', authenticateToken, requirePermission('manage_patients'), upload.single('file'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id) as any;
  if (!prescription) {
    res.status(404).json({ error: 'Prescription not found' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const relativePath = path.posix.join(String(id), req.file.filename);
  db.prepare(`
    UPDATE prescriptions SET attachment_path = ?, attachment_mime = ?, attachment_uploaded_by = ?, attachment_uploaded_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(relativePath, req.file.mimetype, req.user!.id, id);

  logAudit({ userId: req.user?.id, action: 'UPLOAD_PRESCRIPTION_ATTACHMENT', entity: 'PRESCRIPTIONS', entityId: id, newValues: { mime: req.file.mimetype, size: req.file.size }, ipAddress: req.ip });

  res.status(201).json({ message: 'Attachment uploaded' });
});

// Streams the attachment back only to authorized, authenticated staff - every access is audited.
prescriptionRouter.get('/:id/attachment', authenticateToken, requirePermission('manage_patients'), (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id) as any;
  if (!prescription || !prescription.attachment_path) {
    res.status(404).json({ error: 'No attachment on file for this prescription' });
    return;
  }

  const fullPath = path.join(ATTACHMENTS_ROOT, prescription.attachment_path);
  if (!fullPath.startsWith(ATTACHMENTS_ROOT) || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Attachment file missing from storage' });
    return;
  }

  logAudit({ userId: req.user?.id, action: 'VIEW_PRESCRIPTION_ATTACHMENT', entity: 'PRESCRIPTIONS', entityId: id, ipAddress: req.ip });

  res.setHeader('Content-Type', prescription.attachment_mime || 'application/octet-stream');
  fs.createReadStream(fullPath).pipe(res);
});
