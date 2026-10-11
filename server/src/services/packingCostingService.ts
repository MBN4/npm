import { db } from '../db/index.js';

export type PackType = 'STRIP_BOX' | 'TUBE' | 'BOTTLE' | 'VIAL_BOX' | 'SACHET_BOX' | 'IV_BAG' | 'OTHER';
export type VerificationStatus = 'VERIFIED' | 'PENDING' | 'MANUAL_OVERRIDE';
export type RateBasis = 'BOX' | 'STRIP' | 'UNIT' | 'PACK';

export interface PackingReference {
  id: number;
  brand_name: string;
  strength: string | null;
  dosage_form: string;
  manufacturer: string | null;
  pack_type: PackType;
  units_per_strip: number | null;
  strips_per_box: number | null;
  container_volume_or_weight: number | null;
  containers_per_pack: number | null;
  saleable_unit_label: string;
  verification_status: VerificationStatus;
  source: string | null;
  verified_at: string | null;
  notes: string | null;
}

/** Units per saleable pack, independent of pack_type: tablets/box, or 1 for bottle/tube/vial-as-sold. */
function unitsPerBoxOrPack(ref: PackingReference): number {
  if (ref.pack_type === 'STRIP_BOX') {
    if (!ref.units_per_strip || !ref.strips_per_box) {
      throw new Error(`Packing for ${ref.brand_name} is STRIP_BOX but missing units_per_strip/strips_per_box`);
    }
    return ref.units_per_strip * ref.strips_per_box;
  }
  // Tube/bottle/vial/sachet/bag: "the box" for costing purposes is containers_per_pack containers,
  // each itself the saleable unit (you don't sell a cream tube by the gram).
  return ref.containers_per_pack ?? 1;
}

/** Looks up a saved, reusable packing reference by exact brand+strength+form(+manufacturer). Never guesses. */
export function lookupPacking(brand: string, strength: string | null, dosageForm: string, manufacturer: string | null): PackingReference | null {
  const row = db.prepare(`
    SELECT * FROM packing_references
    WHERE brand_name = ? COLLATE NOCASE
      AND COALESCE(strength,'') = COALESCE(?,'') COLLATE NOCASE
      AND dosage_form = ? COLLATE NOCASE
      AND (manufacturer IS NULL OR ? IS NULL OR manufacturer = ? COLLATE NOCASE)
    ORDER BY (manufacturer IS NOT NULL) DESC
    LIMIT 1
  `).get(brand, strength, dosageForm, manufacturer, manufacturer) as PackingReference | undefined;
  return row ?? null;
}

/** Finds every saved variant for a brand+strength+form (used to prompt the user when more than one manufacturer/pack exists). */
export function findPackingVariants(brand: string, strength: string | null, dosageForm: string): PackingReference[] {
  return db.prepare(`
    SELECT * FROM packing_references
    WHERE brand_name = ? COLLATE NOCASE
      AND COALESCE(strength,'') = COALESCE(?,'') COLLATE NOCASE
      AND dosage_form = ? COLLATE NOCASE
  `).all(brand, strength, dosageForm) as PackingReference[];
}

export interface SavePackingInput {
  brand_name: string;
  strength: string | null;
  dosage_form: string;
  manufacturer: string | null;
  pack_type: PackType;
  units_per_strip?: number | null;
  strips_per_box?: number | null;
  container_volume_or_weight?: number | null;
  containers_per_pack?: number | null;
  saleable_unit_label: string;
  verification_status: VerificationStatus;
  source?: string | null;
  notes?: string | null;
}

/** Saves (or updates) a packing reference for reuse. Existing VERIFIED/MANUAL_OVERRIDE rows are never
 *  silently clobbered by a lower-confidence re-save unless explicitly forced. */
export function savePacking(input: SavePackingInput, force = false): PackingReference {
  const existing = db.prepare(`
    SELECT * FROM packing_references
    WHERE brand_name = ? COLLATE NOCASE AND COALESCE(strength,'') = COALESCE(?,'') COLLATE NOCASE
      AND dosage_form = ? COLLATE NOCASE AND COALESCE(manufacturer,'') = COALESCE(?,'') COLLATE NOCASE
  `).get(input.brand_name, input.strength, input.dosage_form, input.manufacturer) as PackingReference | undefined;

  if (existing && !force && existing.verification_status !== 'PENDING' && input.verification_status === 'PENDING') {
    return existing; // Don't downgrade a verified/overridden mapping back to pending.
  }

  const now = new Date().toISOString();
  if (existing) {
    db.prepare(`
      UPDATE packing_references SET pack_type=?, units_per_strip=?, strips_per_box=?,
        container_volume_or_weight=?, containers_per_pack=?, saleable_unit_label=?,
        verification_status=?, source=?, verified_at=?, notes=?, updated_at=?
      WHERE id=?
    `).run(input.pack_type, input.units_per_strip ?? null, input.strips_per_box ?? null,
      input.container_volume_or_weight ?? null, input.containers_per_pack ?? null, input.saleable_unit_label,
      input.verification_status, input.source ?? null, input.verification_status === 'PENDING' ? null : now,
      input.notes ?? null, now, existing.id);
    return { ...existing, ...input, verified_at: input.verification_status === 'PENDING' ? null : now } as PackingReference;
  }

  const info = db.prepare(`
    INSERT INTO packing_references (
      brand_name, strength, dosage_form, manufacturer, pack_type, units_per_strip, strips_per_box,
      container_volume_or_weight, containers_per_pack, saleable_unit_label, verification_status,
      source, verified_at, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(input.brand_name, input.strength, input.dosage_form, input.manufacturer, input.pack_type,
    input.units_per_strip ?? null, input.strips_per_box ?? null, input.container_volume_or_weight ?? null,
    input.containers_per_pack ?? null, input.saleable_unit_label, input.verification_status,
    input.source ?? null, input.verification_status === 'PENDING' ? now : null, input.notes ?? null, now, now);

  return lookupPacking(input.brand_name, input.strength, input.dosage_form, input.manufacturer)
    ?? (db.prepare('SELECT * FROM packing_references WHERE id = ?').get(info.lastInsertRowid) as PackingReference);
}

export interface CostResult {
  costPerUnit: number;
  costPerStrip: number | null; // null for non-strip pack types
  costPerBoxOrPack: number;
  unitsPerBoxOrPack: number;
}

/** Converts an entered box/strip/unit RATE (never MRP/selling price) into per-unit and per-strip cost,
 *  using the pack's verified structure. Throws rather than guessing if the packing is still PENDING. */
export function computeCostFromRate(ref: PackingReference, rate: number, basis: RateBasis): CostResult {
  if (ref.verification_status === 'PENDING') {
    throw new Error(`Packing for ${ref.brand_name} ${ref.strength ?? ''} is unverified (PENDING) - confirm packing before costing.`);
  }
  const unitsPerBox = unitsPerBoxOrPack(ref);
  let costPerUnit: number;
  if (basis === 'BOX' || basis === 'PACK') {
    costPerUnit = rate / unitsPerBox;
  } else if (basis === 'STRIP') {
    if (ref.pack_type !== 'STRIP_BOX' || !ref.units_per_strip) {
      throw new Error(`STRIP rate basis only applies to STRIP_BOX pack types (tablets/capsules)`);
    }
    costPerUnit = rate / ref.units_per_strip;
  } else {
    costPerUnit = rate;
  }
  costPerUnit = round2(costPerUnit);
  const costPerStrip = ref.pack_type === 'STRIP_BOX' && ref.units_per_strip ? round2(costPerUnit * ref.units_per_strip) : null;
  const costPerBoxOrPack = round2(costPerUnit * unitsPerBox);
  return { costPerUnit, costPerStrip, costPerBoxOrPack, unitsPerBoxOrPack: unitsPerBox };
}

export interface MixedQuantityInput {
  boxesOrPacks?: number;
  strips?: number; // STRIP_BOX only
  looseUnits?: number;
}

/** Totals a mixed quantity (e.g. 3 boxes + 1 strip + 2 loose tablets) into total saleable units and
 *  total cost, using a previously computed per-unit cost. Never mixes purchase cost with sale price. */
export function totalFromMixedQuantity(ref: PackingReference, qty: MixedQuantityInput, costPerUnit: number): { totalUnits: number; totalCost: number } {
  const unitsPerBox = unitsPerBoxOrPack(ref);
  const unitsPerStrip = ref.pack_type === 'STRIP_BOX' ? (ref.units_per_strip ?? 0) : 0;
  const totalUnits =
    (qty.boxesOrPacks ?? 0) * unitsPerBox +
    (qty.strips ?? 0) * unitsPerStrip +
    (qty.looseUnits ?? 0);
  return { totalUnits, totalCost: round2(totalUnits * costPerUnit) };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
