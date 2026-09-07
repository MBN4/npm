export interface User {
  id: number;
  username: string;
  fullName: string;
  email?: string;
  roleId: number;
  roleName: 'Admin' | 'Pharmacist' | 'Cashier' | 'Inventory Staff' | string;
  phone?: string;
  isActive?: boolean;
  permissions: string[];
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  username?: string;
  full_name?: string;
  action: string;
  entity: string;
  entity_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface SystemSettings {
  pharmacy_name: string;
  pharmacy_address: string;
  pharmacy_phone: string;
  currency_symbol: string;
  tax_rate_percent: string;
  receipt_footer: string;
  near_expiry_threshold_days: string;
  low_stock_threshold_default: string;
}
