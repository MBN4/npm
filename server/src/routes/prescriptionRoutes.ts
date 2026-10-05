import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { triggerAutoSync } from '../services/gitSyncService.js';

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
  const {
    patientId, doctorId, diagnosis, notes, items,
    purchaserName, purchaserRelation, purchaserCnic, purchaserMobile,
    patientCnic, patientMobile, patientAddress,
    prescriberRegistrationNumber, prescriberAddress, originalDocumentReference
  } = req.body;

  if (!patientId || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Patient and at least one medicine line item are required' });
    return;
  }

  try {
    const result = runTransaction(() => {
      const pResult = db.prepare(`
        INSERT INTO prescriptions (
          patient_id, doctor_id, diagnosis, notes, created_by,
          purchaser_name, purchaser_relation, purchaser_cnic, purchaser_mobile,
          patient_cnic, patient_mobile, patient_address,
          prescriber_registration_number, prescriber_address, original_document_reference,
          review_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `).run(
        patientId,
        doctorId || null,
        diagnosis || null,
        notes || null,
        req.user?.id,
        purchaserName || null, purchaserRelation || null, purchaserCnic || null, purchaserMobile || null,
        patientCnic || null, patientMobile || null, patientAddress || null,
        prescriberRegistrationNumber || null, prescriberAddress || null, originalDocumentReference || null
      );

      const prescriptionId = pResult.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO prescription_items (
          prescription_id, medicine_id, dosage, frequency, duration, timing, instructions,
          authorized_quantity, unit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          it.instructions || null,
          it.authorizedQuantity !== undefined && it.authorizedQuantity !== null && it.authorizedQuantity !== '' ? Number(it.authorizedQuantity) : null,
          it.unit || null
        );
      }

      logAudit({
        userId: req.user?.id,
        action: 'CREATE_PRESCRIPTION',
        entity: 'PRESCRIPTIONS',
        entityId: Number(prescriptionId),
        newValues: { patientId, itemsCount: items.length },
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
