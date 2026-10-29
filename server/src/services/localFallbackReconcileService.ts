import { db } from '../db/index.js';

// Local-fallback instance only. Sends outage-time records (new patients, purchases, sales) to the
// cloud through its REAL API - never a raw database merge - so every normal validation, stock
// deduction, and idempotency check the cloud already has runs exactly as it would for a live
// transaction. Processes in dependency order (patients, then purchases, then sales) regardless of
// the order the caller asks for, remaps any id a newly-created local record can't share with the
// cloud (new patients, new batches from outage-time purchases), and never touches the local
// database as a side effect - only the `local_fallback_reconciliation` bookkeeping table records
// what happened, so a record already marked SENT is never sent twice even across retries.

export interface PendingCustomer { id: number; name: string; mobile: string | null; cnic: string | null; age: number | null; gender: string; allergy_notes: string | null; credit_limit: number; created_at: string; }
export interface PendingPurchase { id: number; invoice_number: string; supplier_id: number; supplier_name: string; purchase_date: string; subtotal: number; discount: number; tax: number; total_amount: number; paid_amount: number; payment_method: string; notes: string | null; created_at: string; items: any[]; }
export interface PendingSale { id: number; invoice_number: string; customer_id: number | null; customer_name: string | null; subtotal: number; discount: number; tax: number; total_amount: number; paid_amount: number; payment_method: string; notes: string | null; created_at: string; items: any[]; }

export interface PendingRecords {
  customers: PendingCustomer[];
  purchases: PendingPurchase[];
  sales: PendingSale[];
}

function reconciliationStatus(table: string, localId: number): { status: string; cloud_id: number | null; error_message: string | null } | null {
  return db.prepare('SELECT status, cloud_id, error_message FROM local_fallback_reconciliation WHERE table_name = ? AND local_id = ?').get(table, localId) as any;
}

export function getPendingRecords(sinceIso: string): PendingRecords {
  const customers = db.prepare(`SELECT * FROM customers WHERE created_at >= ? ORDER BY created_at ASC`).all(sinceIso) as any[];
  const purchases = db.prepare(`
    SELECT p.*, s.name as supplier_name FROM purchases p JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.created_at >= ? ORDER BY p.created_at ASC
  `).all(sinceIso) as any[];
  const sales = db.prepare(`
    SELECT sa.*, c.name as customer_name FROM sales sa LEFT JOIN customers c ON sa.customer_id = c.id
    WHERE sa.created_at >= ? ORDER BY sa.created_at ASC
  `).all(sinceIso) as any[];

  for (const p of purchases) {
    p.items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(p.id);
  }
  for (const s of sales) {
    s.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(s.id);
  }

  const withStatus = <T extends { id: number }>(rows: T[], table: string) =>
    rows.map(row => ({ ...row, reconciliation: reconciliationStatus(table, row.id) || { status: 'PENDING', cloud_id: null, error_message: null } }));

  return {
    customers: withStatus(customers, 'customers') as any,
    purchases: withStatus(purchases, 'purchases') as any,
    sales: withStatus(sales, 'sales') as any
  };
}

function recordOutcome(table: string, localId: number, status: 'SENT' | 'SKIPPED' | 'FAILED', cloudId: number | null, error: string | null) {
  db.prepare(`
    INSERT INTO local_fallback_reconciliation (table_name, local_id, status, cloud_id, error_message, attempted_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(table_name, local_id) DO UPDATE SET status = excluded.status, cloud_id = excluded.cloud_id, error_message = excluded.error_message, attempted_at = excluded.attempted_at
  `).run(table, localId, status, cloudId, error);
}

async function cloudFetch(cloudBaseUrl: string, cloudToken: string, path: string, init: { method?: string; body?: any } = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${cloudBaseUrl}${path}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudToken}` },
    body: init.body ? JSON.stringify(init.body) : undefined
  });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export interface ReconcileAction { table: 'customers' | 'purchases' | 'sales'; localId: number; }
export interface ReconcileResultItem { table: string; localId: number; status: 'SENT' | 'SKIPPED' | 'FAILED'; cloudId: number | null; error: string | null; }

export async function reconcileRecords(cloudBaseUrl: string, cloudToken: string, actions: ReconcileAction[]): Promise<ReconcileResultItem[]> {
  const results: ReconcileResultItem[] = [];
  const customerIdMap = new Map<number, number>(); // local customer id -> cloud customer id
  const batchIdMap = new Map<string, number>(); // `${medicineId}:${batchNumber}` -> cloud batch id

  const wantedCustomers = new Set(actions.filter(a => a.table === 'customers').map(a => a.localId));
  const wantedPurchases = new Set(actions.filter(a => a.table === 'purchases').map(a => a.localId));
  const wantedSales = new Set(actions.filter(a => a.table === 'sales').map(a => a.localId));

  // --- 1. New patients first, since purchases/sales may reference them ---
  const customers = db.prepare('SELECT * FROM customers WHERE id IN (' + ([...wantedCustomers].join(',') || '-1') + ') ORDER BY created_at ASC').all() as any[];
  for (const customer of customers) {
    const already = reconciliationStatus('customers', customer.id);
    if (already?.status === 'SENT' && already.cloud_id) {
      customerIdMap.set(customer.id, already.cloud_id);
      results.push({ table: 'customers', localId: customer.id, status: 'SENT', cloudId: already.cloud_id, error: null });
      continue;
    }

    try {
      const create = await cloudFetch(cloudBaseUrl, cloudToken, '/api/patients', {
        method: 'POST',
        body: {
          name: customer.name, mobile: customer.mobile, cnic: customer.cnic, age: customer.age,
          gender: customer.gender, allergyNotes: customer.allergy_notes, creditLimit: customer.credit_limit
        }
      });

      if (create.ok) {
        customerIdMap.set(customer.id, create.data.patientId);
        recordOutcome('customers', customer.id, 'SENT', create.data.patientId, null);
        results.push({ table: 'customers', localId: customer.id, status: 'SENT', cloudId: create.data.patientId, error: null });
        continue;
      }

      // Mobile already registered on the cloud (e.g. the same patient was separately added there
      // too) - treat the existing cloud patient as the match instead of failing outright.
      if (create.status === 400 && customer.mobile && /already registered/i.test(create.data.error || '')) {
        const lookup = await cloudFetch(cloudBaseUrl, cloudToken, `/api/patients?search=${encodeURIComponent(customer.mobile)}`);
        const match = (lookup.data.patients || []).find((p: any) => p.mobile === customer.mobile);
        if (match) {
          customerIdMap.set(customer.id, match.id);
          recordOutcome('customers', customer.id, 'SENT', match.id, 'Matched an existing cloud patient with the same mobile number instead of creating a duplicate');
          results.push({ table: 'customers', localId: customer.id, status: 'SENT', cloudId: match.id, error: 'Matched existing cloud patient by mobile number' });
          continue;
        }
      }

      recordOutcome('customers', customer.id, 'FAILED', null, create.data.error || `HTTP ${create.status}`);
      results.push({ table: 'customers', localId: customer.id, status: 'FAILED', cloudId: null, error: create.data.error || `HTTP ${create.status}` });
    } catch (err: any) {
      recordOutcome('customers', customer.id, 'FAILED', null, err.message || String(err));
      results.push({ table: 'customers', localId: customer.id, status: 'FAILED', cloudId: null, error: err.message || String(err) });
    }
  }

  // --- 2. Purchases next, so their batches exist on the cloud before any sale references them ---
  const purchases = db.prepare('SELECT * FROM purchases WHERE id IN (' + ([...wantedPurchases].join(',') || '-1') + ') ORDER BY created_at ASC').all() as any[];
  for (const purchase of purchases) {
    const already = reconciliationStatus('purchases', purchase.id);
    if (already?.status === 'SENT') {
      results.push({ table: 'purchases', localId: purchase.id, status: 'SENT', cloudId: already.cloud_id, error: null });
      continue;
    }

    const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(purchase.id) as any[];
    try {
      const create = await cloudFetch(cloudBaseUrl, cloudToken, '/api/purchases', {
        method: 'POST',
        body: {
          supplierId: purchase.supplier_id,
          invoiceNumber: purchase.invoice_number,
          purchaseDate: purchase.purchase_date,
          subtotal: purchase.subtotal,
          discount: purchase.discount,
          tax: purchase.tax,
          totalAmount: purchase.total_amount,
          paidAmount: purchase.paid_amount,
          paymentMethod: purchase.payment_method,
          notes: purchase.notes ? `[Reconciled from offline-backup] ${purchase.notes}` : '[Reconciled from offline-backup]',
          items: items.map(it => ({
            medicineId: it.medicine_id,
            batchNumber: it.batch_number,
            expiryDate: it.expiry_date,
            mfgDate: it.mfg_date,
            purchasePrice: it.purchase_price,
            salePrice: it.sale_price,
            quantity: it.quantity,
            bonusQuantity: it.bonus_quantity,
            lineDiscount: it.line_discount,
            lineTotal: it.line_total
          }))
        }
      });

      if (!create.ok) {
        recordOutcome('purchases', purchase.id, 'FAILED', null, create.data.error || `HTTP ${create.status}`);
        results.push({ table: 'purchases', localId: purchase.id, status: 'FAILED', cloudId: null, error: create.data.error || `HTTP ${create.status}` });
        continue;
      }

      const cloudPurchaseId = create.data.purchaseId;
      const detail = await cloudFetch(cloudBaseUrl, cloudToken, `/api/purchases/${cloudPurchaseId}`);
      if (detail.ok) {
        for (const cloudItem of detail.data.items || []) {
          batchIdMap.set(`${cloudItem.medicine_id}:${cloudItem.batch_number}`, cloudItem.batch_id);
        }
      }

      recordOutcome('purchases', purchase.id, 'SENT', cloudPurchaseId, null);
      results.push({ table: 'purchases', localId: purchase.id, status: 'SENT', cloudId: cloudPurchaseId, error: null });
    } catch (err: any) {
      recordOutcome('purchases', purchase.id, 'FAILED', null, err.message || String(err));
      results.push({ table: 'purchases', localId: purchase.id, status: 'FAILED', cloudId: null, error: err.message || String(err) });
    }
  }

  // --- 3. Sales last, reusing the server's existing, already-proven offline-sale-sync endpoint ---
  const sales = db.prepare('SELECT * FROM sales WHERE id IN (' + ([...wantedSales].join(',') || '-1') + ') ORDER BY created_at ASC').all() as any[];
  for (const sale of sales) {
    const already = reconciliationStatus('sales', sale.id);
    if (already?.status === 'SENT') {
      results.push({ table: 'sales', localId: sale.id, status: 'SENT', cloudId: already.cloud_id, error: null });
      continue;
    }

    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id) as any[];
    const resolvedCustomerId = sale.customer_id
      ? (customerIdMap.get(sale.customer_id) ?? sale.customer_id) // not remapped => this patient predates the outage, same id on both sides
      : null;

    const resolvedItems = items.map(it => {
      const batch = db.prepare('SELECT batch_number FROM batches WHERE id = ?').get(it.batch_id) as { batch_number: string } | undefined;
      const remappedBatchId = batch ? batchIdMap.get(`${it.medicine_id}:${batch.batch_number}`) : undefined;
      return {
        medicineId: it.medicine_id,
        batchId: remappedBatchId ?? it.batch_id, // not remapped => this batch predates the outage, same id on both sides
        quantity: it.quantity,
        unitPrice: it.unit_price,
        discount: it.discount,
        lineTotal: it.line_total,
        descriptionOverride: it.description_snapshot,
        category: it.category_snapshot,
        packType: it.pack_type_snapshot,
        unitsPerPack: it.units_per_pack_snapshot,
        packs: it.packs_snapshot,
        looseUnits: it.loose_units_snapshot
      };
    });

    try {
      const sync = await cloudFetch(cloudBaseUrl, cloudToken, '/api/pos/sync-offline', {
        method: 'POST',
        body: {
          sales: [{
            offlineId: `RECONCILE-${sale.id}-${sale.invoice_number}`,
            customerId: resolvedCustomerId,
            items: resolvedItems,
            subtotal: sale.subtotal,
            discount: sale.discount,
            tax: sale.tax,
            percentageChargeLabel: sale.percentage_charge_label,
            percentageChargeRate: sale.percentage_charge_rate,
            percentageChargeAmount: sale.percentage_charge_amount,
            fixedChargeAmount: sale.fixed_charge_amount,
            totalAmount: sale.total_amount,
            paidAmount: sale.paid_amount,
            paymentMethod: sale.payment_method,
            notes: sale.notes,
            timestamp: sale.created_at,
            billingPersonId: sale.billing_person_id,
            customSlipName: sale.custom_slip_name
          }]
        }
      });

      const synced = sync.data?.synced?.[0];
      const failed = sync.data?.failed?.[0];
      if (sync.ok && synced) {
        recordOutcome('sales', sale.id, 'SENT', synced.serverSaleId, null);
        results.push({ table: 'sales', localId: sale.id, status: 'SENT', cloudId: synced.serverSaleId, error: null });
      } else {
        const error = failed?.error || sync.data?.error || `HTTP ${sync.status}`;
        recordOutcome('sales', sale.id, 'FAILED', null, error);
        results.push({ table: 'sales', localId: sale.id, status: 'FAILED', cloudId: null, error });
      }
    } catch (err: any) {
      recordOutcome('sales', sale.id, 'FAILED', null, err.message || String(err));
      results.push({ table: 'sales', localId: sale.id, status: 'FAILED', cloudId: null, error: err.message || String(err) });
    }
  }

  return results;
}

export function markSkipped(actions: ReconcileAction[]): ReconcileResultItem[] {
  return actions.map(a => {
    recordOutcome(a.table, a.localId, 'SKIPPED', null, null);
    return { table: a.table, localId: a.localId, status: 'SKIPPED' as const, cloudId: null, error: null };
  });
}
