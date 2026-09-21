import { UdhaarCustomer, UdhaarTransaction, UdhaarKPIs } from '../types/udhaar.js';

const API_BASE = '/api/udhaar';

export const udhaarService = {
  // Get Summary KPIs
  getKPIs: async (): Promise<UdhaarKPIs> => {
    try {
      const res = await fetch(`${API_BASE}/dashboard`);
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

      const res = await fetch(`${API_BASE}/customers?${params.toString()}`);
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
    const res = await fetch(`${API_BASE}/customers/${id}`);
    if (!res.ok) throw new Error('Customer not found');
    return await res.json();
  },

  // Create New Customer / Add New Udhaar Entry
  createUdhaar: async (data: Partial<UdhaarCustomer> & { amount?: number; description?: string }): Promise<UdhaarCustomer> => {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    type: 'CREDIT' | 'DEBIT';
    amount: number;
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
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${API_BASE}/aging-report`);
    if (!res.ok) throw new Error('Failed to load aging report');
    return await res.json();
  }
};
