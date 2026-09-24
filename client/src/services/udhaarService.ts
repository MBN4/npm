import { UdhaarCustomer, UdhaarTransaction, UdhaarKPIs } from '../types/udhaar.js';

const API_BASE = '/api/udhaar';

function authHeaders(withJson = false): Record<string, string> {
  const token = localStorage.getItem('nmp_token');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (withJson) headers['Content-Type'] = 'application/json';
  return headers;
}

export const udhaarService = {
  // Get Summary KPIs
  getKPIs: async (): Promise<UdhaarKPIs> => {
    try {
      const res = await fetch(`${API_BASE}/dashboard`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load Udhaar KPIs');
      return await res.json();
    } catch {
      return {
        total_customers: 0,
        total_udhaar: 0,
        overdue_amount: 0,
        overdue_customers: 0,
        paid_this_month: 0,
        total_transactions: 0
      };
    }
  },

  // Get Customers List
  getCustomers: async (search?: string, status?: string, page = 1): Promise<{ customers: UdhaarCustomer[]; pagination: any }> => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (status && status !== 'ALL') params.append('status', status);
      params.append('page', String(page));

      const res = await fetch(`${API_BASE}/customers?${params.toString()}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch customers');
      return await res.json();
    } catch {
      return {
        customers: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 1 }
      };
    }
  },

  // Get Single Customer Detail with Transactions
  getCustomerDetail: async (id: string | number): Promise<{ customer: UdhaarCustomer; transactions: UdhaarTransaction[] }> => {
    const res = await fetch(`${API_BASE}/customers/${id}`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Customer not found');
    return await res.json();
  },

  updateCustomer: async (id: number, data: Pick<UdhaarCustomer, 'name' | 'mobile' | 'reference' | 'address' | 'cnic'>): Promise<UdhaarCustomer> => {
    const res = await fetch(`${API_BASE}/customers/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update customer');
    }
    return await res.json();
  },

  // Create New Customer / Add New Udhaar Entry
  createUdhaar: async (data: Partial<UdhaarCustomer> & { amount?: number; description?: string }): Promise<UdhaarCustomer> => {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create Udhaar entry');
    }
    return await res.json();
  },

  // Record Payment or New Purchase Transaction
  recordTransaction: async (data: {
    customer_id: number;
    type: 'CREDIT' | 'DEBIT' | 'ADJUSTMENT';
    amount: number;
    adjustment_reason?: 'RETURN' | 'DISCOUNT' | 'CORRECTION' | 'WRITE_OFF';
    category?: string;
    reference_no?: string;
    description?: string;
    payment_method?: string;
    date_time?: string;
    created_by_user_id?: number;
    created_by_user_name?: string;
  }): Promise<{ customer: UdhaarCustomer; transaction: UdhaarTransaction }> => {
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to record transaction');
    }
    return await res.json();
  },

  // Get Aging Report
  getAgingReport: async (): Promise<any> => {
    const res = await fetch(`${API_BASE}/aging-report`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to load aging report');
    return await res.json();
  }
};
