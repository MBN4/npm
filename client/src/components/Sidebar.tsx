import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  LayoutDashboard,
  ShoppingCart,
  Pill,
  Boxes,
  Truck,
  Building2,
  ScanBarcode,
  BookOpen,
  Bot,
  FlaskConical,
  FileText,
  Users,
  AlertTriangle,
  ReceiptText,
  BarChart3,
  ShieldCheck,
  Settings
} from 'lucide-react';

export type NavView =
  | 'dashboard'
  | 'pos'
  | 'medicines'
  | 'inventory'
  | 'purchases'
  | 'suppliers'
  | 'barcode'
  | 'dictionary'
  | 'pharma-ai'
  | 'medprac'
  | 'prescriptions'
  | 'patients'
  | 'expiry'
  | 'accounts'
  | 'reports'
  | 'staff'
  | 'settings';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const { hasPermission, user } = useAuth();

  const navItems: { id: NavView; label: string; icon: React.ReactNode; permission?: string; adminOnly?: boolean; badge?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'pos', label: 'POS / Counter', icon: <ShoppingCart size={18} />, permission: 'create_sales' },
    { id: 'medicines', label: 'Medicines Master', icon: <Pill size={18} />, permission: 'manage_medicines' },
    { id: 'inventory', label: 'Inventory & Stock', icon: <Boxes size={18} />, permission: 'manage_inventory' },
    { id: 'purchases', label: 'Purchases', icon: <Truck size={18} />, permission: 'view_purchases' },
    { id: 'suppliers', label: 'Suppliers', icon: <Building2 size={18} />, permission: 'manage_suppliers' },
    { id: 'barcode', label: 'Barcode Center', icon: <ScanBarcode size={18} /> },
    { id: 'dictionary', label: 'Pharma Dictionary 📚', icon: <BookOpen size={18} /> },
    { id: 'pharma-ai', label: 'Pharma.AI 🤖', icon: <Bot size={18} />, permission: 'use_drug_ai' },
    { id: 'medprac', label: 'MedPrac 🧪', icon: <FlaskConical size={18} />, badge: 'SANDBOX' },
    { id: 'prescriptions', label: 'Rx Prescriptions', icon: <FileText size={18} /> },
    { id: 'patients', label: 'Patients & CRM', icon: <Users size={18} />, permission: 'manage_patients' },
    { id: 'expiry', label: 'Expiry Control', icon: <AlertTriangle size={18} /> },
    { id: 'accounts', label: 'Accounts & Cash', icon: <ReceiptText size={18} />, permission: 'view_accounts' },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={18} />, permission: 'export_data' },
    { id: 'staff', label: 'Staff & Audit', icon: <ShieldCheck size={18} />, adminOnly: true },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} />, adminOnly: true }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-icon">NMP</div>
        <div className="brand-info">
          <h1>Naveed Pharmacy</h1>
          <span>Management System</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => {
          // Check admin only
          if (item.adminOnly && user?.roleName !== 'Admin') {
            return null;
          }
          // Check permission if specified
          if (item.permission && !hasPermission(item.permission)) {
            return null;
          }

          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              {item.icon}
              <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    fontSize: '0.6rem',
                    padding: '0.1rem 0.35rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    fontWeight: 700
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <div>NMP Enterprise v1.0.0</div>
        <div style={{ color: '#38bdf8' }}>Offline-First & SQLite WAL</div>
      </div>
    </aside>
  );
};

