export interface OfflineSaleItem {
  medicineId: number;
  batchId: number;
  brandName?: string;
  strength?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface OfflineSale {
  offlineId: string;
  customerId: number | null;
  customerName?: string;
  items: OfflineSaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  paidAmount: number;
  paymentMethod: string;
  notes?: string;
  timestamp: string;
  billingPersonId?: number | null;
  customSlipName?: string;
}

const OFFLINE_SALES_KEY = 'nmp_offline_sales_queue';

export function getOfflineSalesQueue(): OfflineSale[] {
  try {
    const raw = localStorage.getItem(OFFLINE_SALES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline sales queue', err);
    return [];
  }
}

export function saveOfflineSale(saleData: Omit<OfflineSale, 'offlineId' | 'timestamp'>): OfflineSale {
  const offlineSale: OfflineSale = {
    ...saleData,
    offlineId: 'OFFLINE-' + Date.now().toString() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    timestamp: new Date().toISOString()
  };

  const currentQueue = getOfflineSalesQueue();
  currentQueue.push(offlineSale);
  localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify(currentQueue));

  // Notify components of queue update
  window.dispatchEvent(new CustomEvent('nmp-offline-queue-changed', { detail: { count: currentQueue.length } }));

  return offlineSale;
}

export function clearSyncedSales(syncedOfflineIds: string[]) {
  const currentQueue = getOfflineSalesQueue();
  const remaining = currentQueue.filter(s => !syncedOfflineIds.includes(s.offlineId));
  localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify(remaining));
  window.dispatchEvent(new CustomEvent('nmp-offline-queue-changed', { detail: { count: remaining.length } }));
}

export async function syncOfflineSalesToServer(token: string): Promise<{
  success: boolean;
  syncedCount: number;
  failedCount: number;
  message: string;
}> {
  const queue = getOfflineSalesQueue();
  if (queue.length === 0) {
    return { success: true, syncedCount: 0, failedCount: 0, message: 'No offline sales pending.' };
  }

  try {
    const res = await fetch('/api/pos/sync-offline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ sales: queue })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Server rejected offline sync');
    }

    const data = await res.json();
    const syncedIds = (data.synced || []).map((s: any) => s.offlineId);

    if (syncedIds.length > 0) {
      clearSyncedSales(syncedIds);
    }

    window.dispatchEvent(new CustomEvent('nmp-offline-sync-completed', { detail: data }));

    return {
      success: true,
      syncedCount: data.syncedCount || syncedIds.length,
      failedCount: data.failedCount || 0,
      message: data.message || 'Offline transactions synchronized successfully!'
    };
  } catch (err: any) {
    console.error('Offline sync failed:', err);
    return {
      success: false,
      syncedCount: 0,
      failedCount: queue.length,
      message: err.message || 'Failed to connect to server for synchronization.'
    };
  }
}
