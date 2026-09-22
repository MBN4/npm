export interface UdhaarCustomer {
  id: number;
  name: string;
  mobile: string;
  reference?: string | null;
  cnic?: string | null;
  serial_no: string; // Last 4 digits of CNIC or sequence
  category: 'Medicine' | 'Cosmetics' | 'General Products' | 'Surgical' | string;
  address?: string | null;
  credit_limit: number;
  total_udhaar: number;
  paid_amount: number;
  balance: number;
  status: 'DUE' | 'CLEARED' | 'OVERDUE';
  last_transaction_date: string;
  created_at?: string;
  updated_at?: string;
}

export interface UdhaarTransaction {
  id: number;
  transaction_id: string;
  customer_id: number;
  date_time: string;
  type: 'DEBIT' | 'CREDIT' | 'ADJUSTMENT';
  adjustment_reason?: 'RETURN' | 'DISCOUNT' | 'CORRECTION' | 'WRITE_OFF' | null;
  category?: string | null;
  reference_no?: string | null;
  description?: string | null;
  amount: number;
  payment_method: string;
  balance_after: number;
  created_by_user_id: number;
  created_by_user_name: string;
  created_at?: string;
}

export interface UdhaarKPIs {
  total_customers: number;
  total_udhaar: number;
  overdue_amount: number;
  overdue_customers: number;
  paid_this_month: number;
  total_transactions: number;
}
