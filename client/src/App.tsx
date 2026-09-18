import React, { useState } from 'react';
import { useAuth } from './context/AuthContext.js';
import { Sidebar, NavView } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { LoginView } from './views/LoginView.js';
import { DashboardView } from './views/DashboardView.js';
import { StaffView } from './views/StaffView.js';
import { SettingsView } from './views/SettingsView.js';
import { MedicinesView } from './views/MedicinesView.js';
import { InventoryView } from './views/InventoryView.js';
import { SuppliersView } from './views/SuppliersView.js';
import { PurchasesView } from './views/PurchasesView.js';
import { PosView } from './views/PosView.js';
import { PatientsView } from './views/PatientsView.js';
import { PrescriptionsView } from './views/PrescriptionsView.js';
import { ExpiryView } from './views/ExpiryView.js';
import { AccountsView } from './views/AccountsView.js';
import { BalanceView } from './views/BalanceView.js';
import { ReportsView } from './views/ReportsView.js';
import { BarcodeView } from './views/BarcodeView.js';
import { PharmaDictionaryView } from './views/PharmaDictionaryView.js';
import { PharmaAiView } from './views/PharmaAiView.js';
import { MedPracView } from './views/MedPracView.js';
import { UpcomingPhaseView } from './views/UpcomingPhaseView.js';

export const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<NavView>('dashboard');

  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Initializing NMP Secure Environment...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView onNavigate={setCurrentView} />;
      case 'pos':
        return <PosView />;
      case 'medicines':
        return <MedicinesView />;
      case 'inventory':
        return <InventoryView />;
      case 'purchases':
        return <PurchasesView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'barcode':
        return <BarcodeView />;
      case 'dictionary':
        return <PharmaDictionaryView />;
      case 'pharma-ai':
        return <PharmaAiView />;
      case 'medprac':
        return <MedPracView />;
      case 'prescriptions':
        return <PrescriptionsView />;
      case 'patients':
        return <PatientsView />;
      case 'expiry':
        return <ExpiryView />;
      case 'accounts':
        return <AccountsView />;
      case 'balance':
        return <BalanceView />;
      case 'reports':
        return <ReportsView />;
      case 'staff':
        return <StaffView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <UpcomingPhaseView view={currentView} />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />
      <div className="main-content">
        <Header currentView={currentView} onNavigate={setCurrentView} />
        <main className="page-container">
          {renderView()}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

