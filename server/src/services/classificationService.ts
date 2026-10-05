import { db } from '../db/index.js';

export interface ResolvedClassification {
  id: number;
  version: number;
  entryType: string;
  substanceName: string | null;
  groupDescription: string | null;
  schedule: string; // B, D, BOTH, OTHER, UNCLASSIFIED
  verificationStatus: string;
  matchBasis: string;
}

export interface MedicineScheduleInfo {
  medicineId: number;
  schedule: 'B' | 'D' | 'BOTH' | null; // null = no verified classification applies
  classifications: ResolvedClassification[];
}

function dedupeBySchedule(rows: ResolvedClassification[]): 'B' | 'D' | 'BOTH' | null {
  const schedules = new Set(rows.map(r => r.schedule));
  const hasB = schedules.has('B') || schedules.has('BOTH');
  const hasD = schedules.has('D') || schedules.has('BOTH');
  if (hasB && hasD) return 'BOTH';
  if (hasB) return 'B';
  if (hasD) return 'D';
  return null;
}

/**
 * Resolves which VERIFIED, current classifications apply to a medicine, matching on:
 *  - the medicine's primary generic_id (medicines.generic_id)
 *  - any additional active ingredients (medicine_ingredients) for combination products
 *  - explicit manual links (medicine_classification_links, match_basis = 'MANUAL')
 * Only verification_status = 'VERIFIED' rows can ever drive POS gating - draft/pending/rejected
 * rows are returned by getAllApplicableForReview() instead, never from here.
 */
export function getVerifiedScheduleForMedicine(medicineId: number): MedicineScheduleInfo {
  const medicine = db.prepare('SELECT id, generic_id FROM medicines WHERE id = ?').get(medicineId) as
    | { id: number; generic_id: number | null }
    | undefined;

  if (!medicine) {
    return { medicineId, schedule: null, classifications: [] };
  }

  const genericIds = new Set<number>();
  if (medicine.generic_id) genericIds.add(medicine.generic_id);
  const ingredientRows = db.prepare('SELECT generic_id FROM medicine_ingredients WHERE medicine_id = ?').all(medicineId) as Array<{ generic_id: number }>;
  for (const row of ingredientRows) genericIds.add(row.generic_id);

  const results: ResolvedClassification[] = [];
  const seenIds = new Set<number>();

  if (genericIds.size > 0) {
    const placeholders = Array.from(genericIds).map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT id, version, entry_type, substance_name, group_description, schedule, verification_status
      FROM drug_classifications
      WHERE is_current = 1 AND verification_status = 'VERIFIED' AND generic_id IN (${placeholders})
    `).all(...Array.from(genericIds)) as any[];

    for (const r of rows) {
      if (seenIds.has(r.id)) continue;
      seenIds.add(r.id);
      results.push({
        id: r.id, version: r.version, entryType: r.entry_type, substanceName: r.substance_name,
        groupDescription: r.group_description, schedule: r.schedule, verificationStatus: r.verification_status,
        matchBasis: 'INGREDIENT'
      });
    }
  }

  const manualRows = db.prepare(`
    SELECT dc.id, dc.version, dc.entry_type, dc.substance_name, dc.group_description, dc.schedule, dc.verification_status, mcl.match_basis
    FROM medicine_classification_links mcl
    JOIN drug_classifications dc ON dc.id = mcl.classification_id
    WHERE mcl.medicine_id = ? AND mcl.is_active = 1 AND dc.is_current = 1 AND dc.verification_status = 'VERIFIED'
  `).all(medicineId) as any[];

  for (const r of manualRows) {
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    results.push({
      id: r.id, version: r.version, entryType: r.entry_type, substanceName: r.substance_name,
      groupDescription: r.group_description, schedule: r.schedule, verificationStatus: r.verification_status,
      matchBasis: r.match_basis
    });
  }

  return { medicineId, schedule: dedupeBySchedule(results), classifications: results };
}

/**
 * Lists ALL classifications that could apply to a medicine (including unverified drafts), for the
 * Classification Review UI - never used to gate a sale.
 */
export function getAllApplicableForReview(medicineId: number) {
  const medicine = db.prepare('SELECT id, generic_id FROM medicines WHERE id = ?').get(medicineId) as
    | { id: number; generic_id: number | null }
    | undefined;
  if (!medicine) return [];

  const genericIds = new Set<number>();
  if (medicine.generic_id) genericIds.add(medicine.generic_id);
  const ingredientRows = db.prepare('SELECT generic_id FROM medicine_ingredients WHERE medicine_id = ?').all(medicineId) as Array<{ generic_id: number }>;
  for (const row of ingredientRows) genericIds.add(row.generic_id);

  const clauses: string[] = [];
  const params: any[] = [];
  if (genericIds.size > 0) {
    clauses.push(`generic_id IN (${Array.from(genericIds).map(() => '?').join(',')})`);
    params.push(...Array.from(genericIds));
  }
  clauses.push(`id IN (SELECT classification_id FROM medicine_classification_links WHERE medicine_id = ? AND is_active = 1)`);
  params.push(medicineId);

  return db.prepare(`
    SELECT * FROM drug_classifications WHERE is_current = 1 AND (${clauses.join(' OR ')})
    ORDER BY schedule ASC
  `).all(...params);
}

export interface VerifyParams {
  classificationId: number;
  userId: number;
  decision: 'VERIFIED' | 'REJECTED';
  note?: string;
}

export function verifyClassification(params: VerifyParams): void {
  const row = db.prepare('SELECT * FROM drug_classifications WHERE id = ?').get(params.classificationId) as any;
  if (!row) throw new Error('Classification entry not found');

  db.prepare(`
    UPDATE drug_classifications
    SET verification_status = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP,
        suspected_error_note = COALESCE(?, suspected_error_note)
    WHERE id = ?
  `).run(params.decision, params.userId, params.note || null, params.classificationId);
}

export interface EditClassificationParams {
  classificationId: number;
  userId: number;
  changes: Partial<{
    substanceName: string | null;
    groupDescription: string | null;
    generic_id: number | null;
    strength: string | null;
    dosageForm: string | null;
    route: string | null;
    schedule: string;
    saltsDerivativesNote: string | null;
    restrictionsExemptions: string | null;
    jurisdiction: string;
    sourceReference: string | null;
    effectiveDate: string | null;
  }>;
}

/**
 * Edits a classification. If the row has ever been VERIFIED, a new version is created instead of
 * mutating it in place, so any completed register entry that snapshotted the old version keeps
 * pointing at an unchanged historical row.
 */
export function editClassification(params: EditClassificationParams): number {
  const row = db.prepare('SELECT * FROM drug_classifications WHERE id = ?').get(params.classificationId) as any;
  if (!row) throw new Error('Classification entry not found');

  const c = params.changes;
  const merged = {
    substance_name: c.substanceName !== undefined ? c.substanceName : row.substance_name,
    group_description: c.groupDescription !== undefined ? c.groupDescription : row.group_description,
    generic_id: c.generic_id !== undefined ? c.generic_id : row.generic_id,
    strength: c.strength !== undefined ? c.strength : row.strength,
    dosage_form: c.dosageForm !== undefined ? c.dosageForm : row.dosage_form,
    route: c.route !== undefined ? c.route : row.route,
    schedule: c.schedule !== undefined ? c.schedule : row.schedule,
    salts_derivatives_note: c.saltsDerivativesNote !== undefined ? c.saltsDerivativesNote : row.salts_derivatives_note,
    restrictions_exemptions: c.restrictionsExemptions !== undefined ? c.restrictionsExemptions : row.restrictions_exemptions,
    jurisdiction: c.jurisdiction !== undefined ? c.jurisdiction : row.jurisdiction,
    source_reference: c.sourceReference !== undefined ? c.sourceReference : row.source_reference,
    effective_date: c.effectiveDate !== undefined ? c.effectiveDate : row.effective_date
  };

  if (row.verification_status !== 'VERIFIED') {
    db.prepare(`
      UPDATE drug_classifications SET
        substance_name = ?, group_description = ?, generic_id = ?, strength = ?, dosage_form = ?, route = ?,
        schedule = ?, salts_derivatives_note = ?, restrictions_exemptions = ?, jurisdiction = ?, source_reference = ?,
        effective_date = ?
      WHERE id = ?
    `).run(
      merged.substance_name, merged.group_description, merged.generic_id, merged.strength, merged.dosage_form, merged.route,
      merged.schedule, merged.salts_derivatives_note, merged.restrictions_exemptions, merged.jurisdiction, merged.source_reference,
      merged.effective_date, params.classificationId
    );
    return params.classificationId;
  }

  const newVersion = (row.version || 1) + 1;
  const insertResult = db.prepare(`
    INSERT INTO drug_classifications (
      version, is_current, entry_type, substance_name, group_description, generic_id, strength, dosage_form, route,
      schedule, salts_derivatives_note, restrictions_exemptions, jurisdiction, source_reference, effective_date,
      verification_status, created_by
    ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?)
  `).run(
    newVersion, row.entry_type, merged.substance_name, merged.group_description, merged.generic_id, merged.strength,
    merged.dosage_form, merged.route, merged.schedule, merged.salts_derivatives_note, merged.restrictions_exemptions,
    merged.jurisdiction, merged.source_reference, merged.effective_date, params.userId
  );

  const newId = Number(insertResult.lastInsertRowid);
  db.prepare('UPDATE drug_classifications SET is_current = 0, superseded_by_id = ? WHERE id = ?').run(newId, params.classificationId);
  return newId;
}

export function linkMedicineManually(medicineId: number, classificationId: number, userId: number): void {
  db.prepare(`
    INSERT INTO medicine_classification_links (medicine_id, classification_id, match_basis, is_active, created_by)
    VALUES (?, ?, 'MANUAL', 1, ?)
    ON CONFLICT(medicine_id, classification_id) DO UPDATE SET is_active = 1
  `).run(medicineId, classificationId, userId);
}

export function unlinkMedicine(medicineId: number, classificationId: number): void {
  db.prepare('UPDATE medicine_classification_links SET is_active = 0 WHERE medicine_id = ? AND classification_id = ?').run(medicineId, classificationId);
}
