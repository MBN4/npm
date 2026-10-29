import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { AlertTriangle, Search, CheckCircle2 } from 'lucide-react';

export interface ScanItemRow {
  id: number;
  scan_id: number;
  line_number: number;
  medicine_id: number | null;
  match_status: string;
  product_name_raw: string | null;
  strength_raw: string | null;
  dosage_form_raw: string | null;
  packaging_type: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  mfg_date: string | null;
  boxes_received: number | null;
  supplier_purchase_rate: number | null;
  rate_basis: string | null;
  rate_basis_confirmed: number;
  printed_mrp_per_box: number | null;
  strips_per_box: number | null;
  units_per_strip: number | null;
  confirmed_purchase_cost_per_box: number | null;
  confirmed_sale_price_per_unit: number | null;
  line_discount_raw: number | null;
  line_tax_raw: number | null;
  line_total_raw: number | null;
  bonus_quantity_raw: number | null;
  bonus_quantity_basis: string | null;
  bonus_confirmed: number;
  is_schedule_b: number;
  is_schedule_d: number;
  classification_confirmed: number;
  flagged_unclear: number;
  flag_reason: string | null;
  handwritten_flag: number;
  status: string;
  matched_brand_name?: string | null;
  matched_strength?: string | null;
  matched_dosage_form?: string | null;
}

interface MedicineOption {
  id: number;
  brand_name: string;
  strength?: string;
  dosage_form?: string;
}

const FIELD_MAP: Record<string, string> = {
  medicine_id: 'medicineId',
  match_status: 'matchStatus',
  product_name_raw: 'productNameRaw',
  strength_raw: 'strengthRaw',
  dosage_form_raw: 'dosageFormRaw',
  packaging_type: 'packagingType',
  batch_number: 'batchNumber',
  expiry_date: 'expiryDate',
  mfg_date: 'mfgDate',
  boxes_received: 'boxesReceived',
  supplier_purchase_rate: 'supplierPurchaseRate',
  rate_basis: 'rateBasis',
  rate_basis_confirmed: 'rateBasisConfirmed',
  printed_mrp_per_box: 'printedMrpPerBox',
  strips_per_box: 'stripsPerBox',
  units_per_strip: 'unitsPerStrip',
  confirmed_purchase_cost_per_box: 'confirmedPurchaseCostPerBox',
  confirmed_sale_price_per_unit: 'confirmedSalePricePerUnit',
  line_discount_raw: 'lineDiscountRaw',
  line_tax_raw: 'lineTaxRaw',
  bonus_quantity_raw: 'bonusQuantityRaw',
  bonus_quantity_basis: 'bonusQuantityBasis',
  bonus_confirmed: 'bonusConfirmed',
  is_schedule_b: 'isScheduleB',
  is_schedule_d: 'isScheduleD',
  classification_confirmed: 'classificationConfirmed'
};

const PACKAGING_TYPES = ['STRIP_BOX', 'BOTTLE', 'TUBE', 'SACHET', 'LOOSE', 'OTHER'];
const RATE_BASIS_OPTIONS: { value: string; label: string }[] = [
  { value: 'PER_BOX', label: 'Box' },
  { value: 'PER_STRIP', label: 'Strip' },
  { value: 'PER_UNIT', label: 'Unit' },
  { value: 'PER_BOTTLE', label: 'Bottle' },
  { value: 'PER_TUBE', label: 'Tube' },
  { value: 'UNKNOWN', label: 'Not stated' }
];

function packagingUnitLabel(packagingType: string | null): string {
  switch (packagingType) {
    case 'BOTTLE': return 'Bottle';
    case 'TUBE': return 'Tube';
    case 'SACHET': return 'Sachet';
    default: return 'Unit';
  }
}

function fmt(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return String(n);
}

interface Props {
  item: ScanItemRow;
  readOnly: boolean;
  onSaved: () => void;
}

export const InvoiceScanItemCard: React.FC<Props> = ({ item, readOnly, onSaved }) => {
  const { token } = useAuth();
  const [local, setLocal] = useState<ScanItemRow>(item);
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState(item.product_name_raw || '');
  const [productResults, setProductResults] = useState<MedicineOption[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLocal(item); }, [item]);

  const updateLocal = (field: keyof ScanItemRow, value: any) => {
    setLocal(prev => ({ ...prev, [field]: value }));
  };

  const persist = async (patch: Record<string, any>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/purchases/scans/${item.scan_id}/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch)
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  };

  // Fire a save on blur/change for one field, mapping snake_case -> camelCase body key.
  const commitField = (field: keyof ScanItemRow, value: any) => {
    const apiKey = FIELD_MAP[field as string];
    if (!apiKey) return;
    persist({ [apiKey]: value });
  };

  const searchMedicines = (query: string) => {
    setProductQuery(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) { setProductResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/medicines?search=${encodeURIComponent(query)}&limit=15`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProductResults(data.medicines || []);
        }
      } catch {
        // ignore transient search errors
      }
    }, 350);
  };

  const selectMedicine = (m: MedicineOption) => {
    setProductQuery(`${m.brand_name}${m.strength ? ' ' + m.strength : ''}`);
    setShowProductDropdown(false);
    updateLocal('medicine_id', m.id);
    updateLocal('match_status', 'CONFIRMED');
    persist({ medicineId: m.id, matchStatus: 'CONFIRMED' });
  };

  const markNewProduct = () => {
    updateLocal('medicine_id', null);
    updateLocal('match_status', 'NEW_PRODUCT');
    persist({ medicineId: null, matchStatus: 'NEW_PRODUCT' });
  };

  // ----- Validation (mirrors the server's commit-check so the user sees it before clicking Commit) -----
  const isStripBox = local.packaging_type === 'STRIP_BOX';
  const boxesInvalid = local.boxes_received === null || local.boxes_received === undefined || Number(local.boxes_received) <= 0;
  const mrpMissing = local.printed_mrp_per_box === null || local.printed_mrp_per_box === undefined;
  const stripsMissing = isStripBox && (local.strips_per_box === null || local.strips_per_box === undefined);
  const stripsNotInt = isStripBox && local.strips_per_box !== null && local.strips_per_box !== undefined && (!Number.isInteger(Number(local.strips_per_box)) || Number(local.strips_per_box) < 1);
  const unitsMissing = isStripBox && (local.units_per_strip === null || local.units_per_strip === undefined);
  const unitsNotInt = isStripBox && local.units_per_strip !== null && local.units_per_strip !== undefined && (!Number.isInteger(Number(local.units_per_strip)) || Number(local.units_per_strip) < 1);

  // ----- Live calculation (pure client-side, recomputed on every render) -----
  const strips = isStripBox ? Number(local.strips_per_box) : null;
  const unitsPerStrip = isStripBox ? Number(local.units_per_strip) : null;
  const boxes = local.boxes_received !== null && local.boxes_received !== undefined ? Number(local.boxes_received) : null;
  const mrp = local.printed_mrp_per_box !== null && local.printed_mrp_per_box !== undefined ? Number(local.printed_mrp_per_box) : null;
  const cost = local.confirmed_purchase_cost_per_box !== null && local.confirmed_purchase_cost_per_box !== undefined ? Number(local.confirmed_purchase_cost_per_box) : null;

  const unitsPerBox = isStripBox ? (strips && unitsPerStrip && strips > 0 && unitsPerStrip > 0 ? strips * unitsPerStrip : null) : 1;
  const totalStrips = isStripBox && boxes && strips ? boxes * strips : null;
  const totalUnits = boxes !== null && unitsPerBox !== null ? boxes * unitsPerBox : null;
  const mrpPerStrip = isStripBox && mrp !== null && strips ? mrp / strips : null;
  const mrpPerUnit = mrp !== null && unitsPerBox ? mrp / unitsPerBox : null;
  const costPerStrip = isStripBox && cost !== null && strips ? cost / strips : null;
  const costPerUnit = cost !== null && unitsPerBox ? cost / unitsPerBox : null;

  const flagBanner = local.flagged_unclear ? (local.flag_reason || 'This line needs review - the OCR could not read it clearly.') : null;

  const inputStyle: React.CSSProperties = { padding: '0.4rem 0.55rem', fontSize: '0.82rem', width: '100%' };
  const redInputStyle: React.CSSProperties = { ...inputStyle, border: '1.5px solid var(--danger)' };
  const redLabelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--danger)' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' };

  return (
    <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', border: local.flagged_unclear ? '1.5px solid var(--danger)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
          Line {local.line_number}{saving && <span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>saving...</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {local.handwritten_flag ? (
            <span className="badge badge-warning">⚠ possible handwritten change - review</span>
          ) : null}
          {local.match_status === 'CONFIRMED' && (
            <span className="badge badge-success"><CheckCircle2 size={12} style={{ marginRight: '0.2rem' }} />Matched</span>
          )}
          {local.match_status === 'NEW_PRODUCT' && <span className="badge badge-warning">New product - create in Medicines first</span>}
        </div>
      </div>

      {flagBanner && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.6rem 0.75rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <span>{flagBanner}</span>
        </div>
      )}

      {/* Product identity + match */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Product name (as read)</label>
          <input
            className="input"
            style={inputStyle}
            value={local.product_name_raw || ''}
            disabled={readOnly}
            onChange={e => updateLocal('product_name_raw', e.target.value)}
            onBlur={e => commitField('product_name_raw', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Strength (as read)</label>
          <input
            className="input"
            style={inputStyle}
            value={local.strength_raw || ''}
            disabled={readOnly}
            onChange={e => updateLocal('strength_raw', e.target.value)}
            onBlur={e => commitField('strength_raw', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Dosage form (as read)</label>
          <input
            className="input"
            style={inputStyle}
            value={local.dosage_form_raw || ''}
            disabled={readOnly}
            onChange={e => updateLocal('dosage_form_raw', e.target.value)}
            onBlur={e => commitField('dosage_form_raw', e.target.value)}
          />
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <label style={labelStyle}>Match to catalog product *</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input"
              style={{ ...inputStyle, paddingLeft: '1.8rem' }}
              placeholder="Search medicines master..."
              value={productQuery}
              disabled={readOnly}
              onChange={e => { searchMedicines(e.target.value); setShowProductDropdown(true); }}
              onFocus={() => setShowProductDropdown(true)}
              onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
            />
          </div>
          {!readOnly && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={markNewProduct}>No match</button>
          )}
        </div>
        {local.match_status !== 'CONFIRMED' && (
          <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.2rem' }}>
            Not yet matched/confirmed against the catalog.
          </div>
        )}
        {showProductDropdown && productResults.length > 0 && (
          <div className="card" style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: '0.25rem', maxHeight: '220px', overflowY: 'auto', padding: '0.25rem' }}>
            {productResults.map(m => (
              <div
                key={m.id}
                onMouseDown={() => selectMedicine(m)}
                style={{ padding: '0.4rem 0.6rem', cursor: 'pointer', fontSize: '0.82rem', borderRadius: 'var(--radius-sm)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <strong>{m.brand_name}</strong> {m.strength} <span style={{ color: 'var(--text-muted)' }}>{m.dosage_form}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Packaging type */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Packaging type *</label>
          <select
            className="select"
            style={inputStyle}
            value={local.packaging_type || ''}
            disabled={readOnly}
            onChange={e => { updateLocal('packaging_type', e.target.value); commitField('packaging_type', e.target.value); }}
          >
            <option value="">Select...</option>
            {PACKAGING_TYPES.map(pt => <option key={pt} value={pt}>{pt.replace('_', '/')}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>{isStripBox ? 'Boxes/Packs Received *' : `${packagingUnitLabel(local.packaging_type)}s Received *`}</label>
          <input
            type="number"
            className="input"
            style={boxesInvalid ? redInputStyle : inputStyle}
            value={fmt(local.boxes_received)}
            disabled={readOnly}
            onChange={e => updateLocal('boxes_received', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => commitField('boxes_received', e.target.value === '' ? null : Number(e.target.value))}
          />
          {local.boxes_received !== null && local.boxes_received !== undefined && !readOnly && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Confirm this represents {isStripBox ? 'boxes/packs' : `${packagingUnitLabel(local.packaging_type).toLowerCase()}s`} received.</div>
          )}
          {boxesInvalid && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.15rem' }}>Must be a positive quantity.</div>}
        </div>

        <div>
          <label style={labelStyle}>Supplier Purchase Rate (as read)</label>
          <input
            type="number"
            className="input"
            style={inputStyle}
            value={fmt(local.supplier_purchase_rate)}
            disabled={readOnly}
            onChange={e => updateLocal('supplier_purchase_rate', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => commitField('supplier_purchase_rate', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
      </div>

      {/* Printed MRP - always empty/red until filled */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <div>
          <label style={mrpMissing ? redLabelStyle : labelStyle}>Printed MRP per {isStripBox ? 'Box' : packagingUnitLabel(local.packaging_type)} *</label>
          <input
            type="number"
            step="0.01"
            className="input"
            style={mrpMissing ? redInputStyle : inputStyle}
            placeholder="Enter from physical box"
            value={fmt(local.printed_mrp_per_box)}
            disabled={readOnly}
            onChange={e => updateLocal('printed_mrp_per_box', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => commitField('printed_mrp_per_box', e.target.value === '' ? null : Number(e.target.value))}
          />
          {mrpMissing && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.15rem' }}>Enter printed MRP from the physical box.</div>}
        </div>

        {isStripBox && (
          <>
            <div>
              <label style={stripsMissing ? redLabelStyle : labelStyle}>Strips per Box *</label>
              <input
                type="number"
                step="1"
                className="input"
                style={(stripsMissing || stripsNotInt) ? redInputStyle : inputStyle}
                value={fmt(local.strips_per_box)}
                disabled={readOnly}
                onChange={e => updateLocal('strips_per_box', e.target.value === '' ? null : Number(e.target.value))}
                onBlur={e => commitField('strips_per_box', e.target.value === '' ? null : Math.trunc(Number(e.target.value)))}
              />
              {stripsMissing && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.15rem' }}>Enter strips per box.</div>}
              {!stripsMissing && stripsNotInt && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.15rem' }}>Must be a whole number of 1 or more.</div>}
            </div>
            <div>
              <label style={unitsMissing ? redLabelStyle : labelStyle}>Tablets/Capsules per Strip *</label>
              <input
                type="number"
                step="1"
                className="input"
                style={(unitsMissing || unitsNotInt) ? redInputStyle : inputStyle}
                value={fmt(local.units_per_strip)}
                disabled={readOnly}
                onChange={e => updateLocal('units_per_strip', e.target.value === '' ? null : Number(e.target.value))}
                onBlur={e => commitField('units_per_strip', e.target.value === '' ? null : Math.trunc(Number(e.target.value)))}
              />
              {unitsMissing && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.15rem' }}>Enter tablets/capsules per strip.</div>}
              {!unitsMissing && unitsNotInt && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.15rem' }}>Must be a whole number of 1 or more.</div>}
            </div>
          </>
        )}
      </div>

      {/* Live calculation panel */}
      <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', fontSize: '0.78rem' }}>
        {isStripBox && (
          <>
            <div><span style={{ color: 'var(--text-muted)' }}>Units per box: </span><strong>{unitsPerBox ?? '-'}</strong></div>
            <div><span style={{ color: 'var(--text-muted)' }}>Total strips received: </span><strong>{totalStrips ?? '-'}</strong></div>
          </>
        )}
        <div><span style={{ color: 'var(--text-muted)' }}>Total units received: </span><strong>{totalUnits ?? '-'}</strong></div>
        {isStripBox && <div><span style={{ color: 'var(--text-muted)' }}>MRP per strip: </span><strong>{mrpPerStrip !== null ? `Rs. ${mrpPerStrip.toFixed(2)}` : '-'}</strong></div>}
        <div><span style={{ color: 'var(--text-muted)' }}>MRP per unit: </span><strong>{mrpPerUnit !== null ? `Rs. ${mrpPerUnit.toFixed(2)}` : '-'}</strong></div>
        {isStripBox && <div><span style={{ color: 'var(--text-muted)' }}>Purchase cost per strip: </span><strong>{costPerStrip !== null ? `Rs. ${costPerStrip.toFixed(2)}` : 'Not available'}</strong></div>}
        <div><span style={{ color: 'var(--text-muted)' }}>Purchase cost per unit: </span><strong>{costPerUnit !== null ? `Rs. ${costPerUnit.toFixed(2)}` : 'Not available'}</strong></div>
      </div>

      {/* Rate basis + confirmed costs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>This rate is per: *{!local.rate_basis_confirmed && <span style={{ color: 'var(--warning)', fontWeight: 400 }}> (unconfirmed suggestion)</span>}</label>
          <select
            className="select"
            style={!local.rate_basis_confirmed ? { ...inputStyle, border: '1.5px solid var(--warning)' } : inputStyle}
            value={local.rate_basis || 'UNKNOWN'}
            disabled={readOnly}
            onChange={e => {
              updateLocal('rate_basis', e.target.value);
              updateLocal('rate_basis_confirmed', 1);
              persist({ rateBasis: e.target.value, rateBasisConfirmed: true });
            }}
          >
            {RATE_BASIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Confirmed Purchase Cost per {isStripBox ? 'Box' : packagingUnitLabel(local.packaging_type)}</label>
          <input
            type="number"
            step="0.01"
            className="input"
            style={inputStyle}
            placeholder="Not available"
            value={fmt(local.confirmed_purchase_cost_per_box)}
            disabled={readOnly}
            onChange={e => updateLocal('confirmed_purchase_cost_per_box', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => commitField('confirmed_purchase_cost_per_box', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>

        <div>
          <label style={labelStyle}>Your Selling Price (per unit) *</label>
          <input
            type="number"
            step="0.01"
            className="input"
            style={local.confirmed_sale_price_per_unit === null ? redInputStyle : inputStyle}
            placeholder="Not set"
            value={fmt(local.confirmed_sale_price_per_unit)}
            disabled={readOnly}
            onChange={e => updateLocal('confirmed_sale_price_per_unit', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => commitField('confirmed_sale_price_per_unit', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
      </div>

      {/* Discount / tax */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Line Discount (as read)</label>
          <input
            type="number" step="0.01" className="input" style={inputStyle}
            value={fmt(local.line_discount_raw)} disabled={readOnly}
            onChange={e => updateLocal('line_discount_raw', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => commitField('line_discount_raw', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div>
          <label style={labelStyle}>Line Tax (as read)</label>
          <input
            type="number" step="0.01" className="input" style={inputStyle}
            value={fmt(local.line_tax_raw)} disabled={readOnly}
            onChange={e => updateLocal('line_tax_raw', e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => commitField('line_tax_raw', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div>
          <label style={labelStyle}>Batch Number *</label>
          <input
            className="input" style={!local.batch_number ? redInputStyle : inputStyle}
            value={local.batch_number || ''} disabled={readOnly}
            onChange={e => updateLocal('batch_number', e.target.value)}
            onBlur={e => commitField('batch_number', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Expiry Date *</label>
          <input
            type="date" className="input" style={!local.expiry_date ? redInputStyle : inputStyle}
            value={local.expiry_date || ''} disabled={readOnly}
            onChange={e => updateLocal('expiry_date', e.target.value)}
            onBlur={e => commitField('expiry_date', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Mfg. Date</label>
          <input
            type="date" className="input" style={inputStyle}
            value={local.mfg_date || ''} disabled={readOnly}
            onChange={e => updateLocal('mfg_date', e.target.value)}
            onBlur={e => commitField('mfg_date', e.target.value)}
          />
        </div>
      </div>

      {/* Bonus quantity */}
      {local.bonus_quantity_raw !== null && local.bonus_quantity_raw !== undefined && Number(local.bonus_quantity_raw) > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', padding: '0.6rem', background: 'var(--warning-light)', borderRadius: 'var(--radius-md)' }}>
          <div>
            <label style={labelStyle}>Bonus/Free Quantity (as read)</label>
            <input
              type="number" className="input" style={inputStyle}
              value={fmt(local.bonus_quantity_raw)} disabled={readOnly}
              onChange={e => updateLocal('bonus_quantity_raw', e.target.value === '' ? null : Number(e.target.value))}
              onBlur={e => commitField('bonus_quantity_raw', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label style={labelStyle}>Basis</label>
            <select
              className="select" style={inputStyle} value={local.bonus_quantity_basis || ''} disabled={readOnly}
              onChange={e => { updateLocal('bonus_quantity_basis', e.target.value); commitField('bonus_quantity_basis', e.target.value); }}
            >
              <option value="">Select...</option>
              <option value="BOXES">Boxes</option>
              <option value="STRIPS">Strips</option>
              <option value="UNITS">Units</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
              <input
                type="checkbox" checked={!!local.bonus_confirmed} disabled={readOnly}
                onChange={e => { updateLocal('bonus_confirmed', e.target.checked ? 1 : 0); commitField('bonus_confirmed', e.target.checked); }}
              />
              Confirm bonus quantity *
            </label>
          </div>
        </div>
      )}

      {/* Item-level schedule B/D */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={!!local.is_schedule_b} disabled={readOnly}
            onChange={e => { updateLocal('is_schedule_b', e.target.checked ? 1 : 0); commitField('is_schedule_b', e.target.checked); }} />
          Schedule B (this item)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={!!local.is_schedule_d} disabled={readOnly}
            onChange={e => { updateLocal('is_schedule_d', e.target.checked ? 1 : 0); commitField('is_schedule_d', e.target.checked); }} />
          Schedule D (this item)
        </label>
        {(local.is_schedule_b || local.is_schedule_d) ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--danger)' }}>
            <input type="checkbox" checked={!!local.classification_confirmed} disabled={readOnly}
              onChange={e => { updateLocal('classification_confirmed', e.target.checked ? 1 : 0); commitField('classification_confirmed', e.target.checked); }} />
            Classification confirmed *
          </label>
        ) : null}
      </div>
    </div>
  );
};
