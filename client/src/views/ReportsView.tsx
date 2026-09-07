import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  Clock,
  Package,
  Users,
  Building2,
  UserCheck
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'sales' | 'inventory' | 'deadstock' | 'credit' | 'payables' | 'staff'>('sales');
  const [isLoading, setIsLoading] = useState(false);

  // Sales state
  const [salesSummary, setSalesSummary] = useState<any>(null);
  const [topSelling, setTopSelling] = useState<any[]>([]);
  const [salesFilter, setSalesFilter] = useState({
    startDate: '',
    endDate: '',
    paymentMethod: ''
  });

  // Inventory state
  const [inventoryValuation, setInventoryValuation] = useState<any>(null);

  // Dead stock state
  const [deadStockData, setDeadStockData] = useState<any>(null);
  const [deadStockDays, setDeadStockDays] = useState<number>(60);

  // Credit state
  const [creditData, setCreditData] = useState<any>(null);

  // Payables state
  const [payablesData, setPayablesData] = useState<any>(null);

  // Staff state
  const [staffPerformance, setStaffPerformance] = useState<any[]>([]);

  // 1. Fetch Sales
  const fetchSalesData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (salesFilter.startDate) params.append('startDate', salesFilter.startDate);
      if (salesFilter.endDate) params.append('endDate', salesFilter.endDate);
      if (salesFilter.paymentMethod) params.append('paymentMethod', salesFilter.paymentMethod);

      const [summaryRes, topRes] = await Promise.all([
        fetch(`/api/reports/sales-summary?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/reports/top-selling?limit=10&${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSalesSummary(data);
      }
      if (topRes.ok) {
        const data = await topRes.json();
        setTopSelling(data.topItems || []);
      }
    } catch (err) {
      console.error('Failed to fetch sales report:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, salesFilter]);

  // 2. Fetch Inventory Valuation
  const fetchInventoryData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/reports/inventory-valuation', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInventoryValuation(data);
      }
    } catch (err) {
      console.error('Failed to fetch inventory valuation:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // 3. Fetch Dead Stock
  const fetchDeadStock = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/reports/dead-stock?days=${deadStockDays}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDeadStockData(data);
      }
    } catch (err) {
      console.error('Failed to fetch dead stock report:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, deadStockDays]);

  // 4. Fetch Customer Credit
  const fetchCreditData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/reports/customer-credit', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCreditData(data);
      }
    } catch (err) {
      console.error('Failed to fetch credit report:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // 5. Fetch Supplier Payables
  const fetchPayablesData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/reports/supplier-payables', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPayablesData(data);
      }
    } catch (err) {
      console.error('Failed to fetch payables report:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // 6. Fetch Staff Performance
  const fetchStaffData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/reports/cashier-performance', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStaffPerformance(data.performance || []);
      }
    } catch (err) {
      console.error('Failed to fetch staff performance:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'sales') fetchSalesData();
    if (activeTab === 'inventory') fetchInventoryData();
    if (activeTab === 'deadstock') fetchDeadStock();
    if (activeTab === 'credit') fetchCreditData();
    if (activeTab === 'payables') fetchPayablesData();
    if (activeTab === 'staff') fetchStaffData();
  }, [activeTab, fetchSalesData, fetchInventoryData, fetchDeadStock, fetchCreditData, fetchPayablesData, fetchStaffData]);

  const handleExportCsv = (type: string) => {
    window.open(`/api/reports/export-csv?type=${type}`, '_blank');
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <BarChart3 style={{ color: 'var(--primary)', width: '2rem', height: '2rem' }} />
            Reports & Business Intelligence
            {isLoading && <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>Updating...</span>}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Comprehensive analytics, inventory valuation, dead stock identification, credit tracking, and exports
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--surface-hover)', padding: '0.25rem', borderRadius: 'var(--radius)', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('sales')}
            style={{
              padding: '0.5rem 0.8rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'sales' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'sales' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'sales' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <TrendingUp size={15} /> Sales & Trends
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            style={{
              padding: '0.5rem 0.8rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'inventory' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'inventory' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'inventory' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <Package size={15} /> Inventory Valuation
          </button>
          <button
            onClick={() => setActiveTab('deadstock')}
            style={{
              padding: '0.5rem 0.8rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'deadstock' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'deadstock' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'deadstock' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <Clock size={15} /> Dead Stock
          </button>
          <button
            onClick={() => setActiveTab('credit')}
            style={{
              padding: '0.5rem 0.8rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'credit' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'credit' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'credit' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <Users size={15} /> Customer Udhar
          </button>
          <button
            onClick={() => setActiveTab('payables')}
            style={{
              padding: '0.5rem 0.8rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'payables' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'payables' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'payables' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <Building2 size={15} /> Supplier Payables
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            style={{
              padding: '0.5rem 0.8rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'staff' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'staff' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'staff' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem'
            }}
          >
            <UserCheck size={15} /> Staff Performance
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: SALES & TRENDS                                    */}
      {/* ======================================================== */}
      {activeTab === 'sales' && salesSummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Filters & Export */}
          <div style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
                <span>Range:</span>
              </div>
              <input
                type="date"
                value={salesFilter.startDate}
                onChange={(e) => setSalesFilter({ ...salesFilter, startDate: e.target.value })}
                className="input-field"
                style={{ width: '140px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.85rem' }}>to</span>
              <input
                type="date"
                value={salesFilter.endDate}
                onChange={(e) => setSalesFilter({ ...salesFilter, endDate: e.target.value })}
                className="input-field"
                style={{ width: '140px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
              />
              <select
                value={salesFilter.paymentMethod}
                onChange={(e) => setSalesFilter({ ...salesFilter, paymentMethod: e.target.value })}
                className="input-field"
                style={{ width: '140px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
              >
                <option value="">All Payments</option>
                <option value="CASH">CASH</option>
                <option value="CARD">CARD</option>
                <option value="CREDIT">CREDIT (Udhar)</option>
              </select>
            </div>

            <button
              onClick={() => handleExportCsv('sales')}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
            >
              <Download size={16} /> Export Sales CSV
            </button>
          </div>

          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>NET SALES REVENUE</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                Rs. {salesSummary.summary.netSales.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{salesSummary.summary.totalInvoices} Invoices</div>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>COST OF GOODS SOLD</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                Rs. {salesSummary.summary.totalCogs.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Purchase cost basis</div>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>GROSS PROFIT</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--success)' }}>
                Rs. {salesSummary.summary.grossProfit.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>{salesSummary.summary.profitMarginPct}% Margin</div>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>DISCOUNTS GRANTED</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--warning)' }}>
                Rs. {salesSummary.summary.totalDiscount.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Promotional reductions</div>
            </div>
          </div>

          {/* Top Selling Medicines & Payment Breakdown Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
            {/* Top Selling */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                <span>Top Selling Medicines (By Units Sold)</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.6rem 1rem' }}>MEDICINE</th>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>UNITS</th>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>REVENUE</th>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>PROFIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSelling.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No sales data available.</td></tr>
                    ) : (
                      topSelling.map((item) => (
                        <tr key={item.medicine_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.6rem 1rem' }}>
                            <div style={{ fontWeight: '600' }}>{item.brand_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.strength} • {item.dosage_form}</div>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontWeight: 'bold' }}>
                            {item.total_units_sold}
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: '600' }}>
                            Rs. {item.total_revenue.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.6rem 1rem', textAlign: 'right', color: 'var(--success)', fontWeight: 'bold' }}>
                            Rs. {item.gross_profit.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Method Breakdown & Trend */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Payment Channel Distribution
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {salesSummary.paymentBreakdown.map((pm: any) => {
                  const pct = salesSummary.summary.netSales > 0
                    ? ((pm.total_volume / salesSummary.summary.netSales) * 100).toFixed(1)
                    : '0';
                  return (
                    <div key={pm.payment_method} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: '600' }}>{pm.payment_method} ({pm.count} bills)</span>
                        <span>Rs. {pm.total_volume.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div style={{ height: '8px', width: '100%', background: 'var(--surface-hover)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: '4px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginTop: '1rem' }}>
                Daily Sales Trend (Last 7 Days)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {salesSummary.dailyTrend.slice(0, 7).map((day: any) => (
                  <div key={day.sale_date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.25rem 0', borderBottom: '1px dashed var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{day.sale_date} ({day.invoice_count} bills)</span>
                    <span style={{ fontWeight: 'bold' }}>Rs. {day.daily_total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: INVENTORY VALUATION REPORT                        */}
      {/* ======================================================== */}
      {activeTab === 'inventory' && inventoryValuation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Banner with CSV Export */}
          <div style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ fontWeight: 'bold' }}>
              Inventory Valuation Snapshot (Current Stock on Shelves)
            </div>
            <button
              onClick={() => handleExportCsv('inventory')}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
            >
              <Download size={16} /> Export Batch Valuation CSV
            </button>
          </div>

          {/* Valuation KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL STOCK QUANTITY</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {inventoryValuation.summary.totalStockUnits.toLocaleString()} units
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Across {inventoryValuation.summary.distinctMedicines} items / {inventoryValuation.summary.activeBatches} active batches
              </div>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL COST VALUATION (COGS)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                Rs. {inventoryValuation.summary.totalCostValuation.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pharmacy investment basis</div>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL RETAIL VALUE</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--success)' }}>
                Rs. {inventoryValuation.summary.totalRetailValuation.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Expected gross sales revenue</div>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>UNREALIZED GROSS PROFIT</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--success)' }}>
                Rs. {inventoryValuation.summary.unrealizedProfit.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>{inventoryValuation.summary.unrealizedMarginPct}% Projected Margin</div>
            </div>
          </div>

          {/* Category Breakdown Table */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold' }}>
              Valuation Breakdown by Therapeutic Category
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>CATEGORY</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>MEDICINES</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>STOCK UNITS</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>COST BASIS</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>RETAIL VALUE</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>POTENTIAL PROFIT</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryValuation.categoryBreakdown.map((cat: any) => {
                    const profit = cat.retail_value - cat.cost_value;
                    return (
                      <tr key={cat.category_name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{cat.category_name}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{cat.medicine_count}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 'bold' }}>{cat.stock_units.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Rs. {cat.cost_value.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Rs. {cat.retail_value.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--success)', fontWeight: 'bold' }}>
                          Rs. {profit.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: DEAD STOCK / SLOW MOVING INVENTORY                */}
      {/* ======================================================== */}
      {activeTab === 'deadstock' && deadStockData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontWeight: 'bold' }}>Days Without Any Sale:</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[30, 60, 90, 180].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDeadStockDays(d)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      background: deadStockDays === d ? 'var(--primary)' : 'var(--surface-hover)',
                      color: deadStockDays === d ? '#fff' : 'var(--text-main)',
                      fontWeight: deadStockDays === d ? 'bold' : 'normal',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    {d} Days+
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '0.9rem' }}>
                Tied Up Capital: <strong style={{ color: 'var(--danger)' }}>Rs. {deadStockData.totalTiedUpCapital.toLocaleString()}</strong> ({deadStockData.itemCount} batches)
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold' }}>
              Dead Stock Batches ({deadStockData.deadStock.length} items with zero sales in {deadStockDays}+ days)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>MEDICINE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>BATCH #</th>
                    <th style={{ padding: '0.75rem 1rem' }}>RACK</th>
                    <th style={{ padding: '0.75rem 1rem' }}>SUPPLIER</th>
                    <th style={{ padding: '0.75rem 1rem' }}>EXPIRY</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>QTY</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>TIED CAPITAL</th>
                  </tr>
                </thead>
                <tbody>
                  {deadStockData.deadStock.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No dead stock detected for this threshold. Excellent inventory turnover!</td></tr>
                  ) : (
                    deadStockData.deadStock.map((b: any) => (
                      <tr key={b.batch_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: '600' }}>{b.brand_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.strength} • {b.dosage_form}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{b.batch_number}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{b.rack_location || '—'}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{b.supplier_name || '—'}</td>
                        <td style={{ padding: '0.75rem 1rem', color: 'var(--warning)', fontWeight: '500' }}>{b.expiry_date}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 'bold' }}>{b.quantity}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>
                          Rs. {b.tied_up_capital.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: CUSTOMER UDHAR / CREDIT AGING                     */}
      {/* ======================================================== */}
      {activeTab === 'credit' && creditData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TOTAL RECEIVABLES (UDHAR OUTSTANDING): </span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--warning)', marginLeft: '0.5rem' }}>
                Rs. {creditData.totalOutstanding.toLocaleString()}
              </strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                ({creditData.customerCount} customers with balance)
              </span>
            </div>

            <button
              onClick={() => handleExportCsv('customer-credit')}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
            >
              <Download size={16} /> Export Credit CSV
            </button>
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold' }}>
              Customer Udhar Aging & Due Balances
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>CUSTOMER NAME</th>
                    <th style={{ padding: '0.75rem 1rem' }}>MOBILE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>CREDIT LIMIT</th>
                    <th style={{ padding: '0.75rem 1rem' }}>LAST PURCHASE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>LAST PAYMENT</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>OUTSTANDING BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {creditData.customers.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Zero outstanding customer debt! Excellent recovery rate.</td></tr>
                  ) : (
                    creditData.customers.map((c: any) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{c.name}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{c.mobile || '—'}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>Rs. {c.credit_limit.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{c.last_purchase_date ? new Date(c.last_purchase_date).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{c.last_payment_date ? new Date(c.last_payment_date).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--warning)', fontSize: '0.95rem' }}>
                          Rs. {c.current_balance.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: SUPPLIER PAYABLES                                 */}
      {/* ======================================================== */}
      {activeTab === 'payables' && payablesData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TOTAL SUPPLIER PAYABLES OUTSTANDING: </span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--danger)', marginLeft: '0.5rem' }}>
                Rs. {payablesData.totalPayables.toLocaleString()}
              </strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                ({payablesData.supplierCount} suppliers with balance)
              </span>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold' }}>
              Supplier Balances Due
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>SUPPLIER NAME</th>
                    <th style={{ padding: '0.75rem 1rem' }}>CONTACT PERSON</th>
                    <th style={{ padding: '0.75rem 1rem' }}>PHONE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>LAST INVOICE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>LAST PAYMENT</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>BALANCE OWED</th>
                  </tr>
                </thead>
                <tbody>
                  {payablesData.suppliers.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>All supplier bills are settled in full!</td></tr>
                  ) : (
                    payablesData.suppliers.map((s: any) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{s.name}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{s.contact_person || '—'}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{s.phone || '—'}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{s.last_purchase_date ? new Date(s.last_purchase_date).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>{s.last_payment_date ? new Date(s.last_payment_date).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)', fontSize: '0.95rem' }}>
                          Rs. {s.current_balance.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 6: STAFF / CASHIER PERFORMANCE                       */}
      {/* ======================================================== */}
      {activeTab === 'staff' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold' }}>
              Cashier & Counter Staff Performance Metrics
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>STAFF USERNAME</th>
                    <th style={{ padding: '0.75rem 1rem' }}>FULL NAME</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>TOTAL TRANSACTIONS</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>DISCOUNTS GIVEN</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>AVG BILL VALUE</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>TOTAL SALES VOLUME</th>
                  </tr>
                </thead>
                <tbody>
                  {staffPerformance.map((u: any) => (
                    <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{u.username}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{u.full_name}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 'bold' }}>{u.total_transactions}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--warning)' }}>Rs. {u.total_discounts_granted.toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Rs. {Math.round(u.average_bill_value).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.95rem' }}>
                        Rs. {u.total_sales_volume.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
