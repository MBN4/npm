import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

export const reportRouter = Router();

// Require 'export_data' or admin permission for reporting
const reportingAuth = [authenticateToken, requirePermission('export_data')];

// ==========================================
// 1. SALES SUMMARY & ANALYTICS REPORT
// ==========================================
reportRouter.get(['/sales-summary', '/sales-analytics'], reportingAuth, (req: Request, res: Response) => {
  try {
    const { startDate, endDate, paymentMethod, cashierId } = req.query;

    let filter = " WHERE s.status = 'COMPLETED' ";
    const params: any[] = [];

    if (startDate) {
      filter += ' AND DATE(s.created_at) >= DATE(?) ';
      params.push(startDate);
    }
    if (endDate) {
      filter += ' AND DATE(s.created_at) <= DATE(?) ';
      params.push(endDate);
    }
    if (paymentMethod) {
      filter += ' AND s.payment_method = ? ';
      params.push(paymentMethod);
    }
    if (cashierId) {
      filter += ' AND s.cashier_id = ? ';
      params.push(cashierId);
    }

    // High-level aggregates
    const aggregates = db.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(s.subtotal), 0) as gross_subtotal,
        COALESCE(SUM(s.discount), 0) as total_discount,
        COALESCE(SUM(s.tax), 0) as total_tax,
        COALESCE(SUM(s.total_amount), 0) as net_sales,
        COALESCE(SUM(s.paid_amount), 0) as total_cash_collected,
        COALESCE(SUM(s.remaining_amount), 0) as total_credit_extended
      FROM sales s
      ${filter}
    `).get(...params) as any;

    // COGS for these sales
    const cogsResult = db.prepare(`
      SELECT COALESCE(SUM(si.purchase_price_snapshot * si.quantity), 0) as total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      ${filter}
    `).get(...params) as any;

    const netSales = Number(aggregates.net_sales || 0);
    const totalCogs = Number(cogsResult.total_cogs || 0);
    const grossProfit = netSales - totalCogs;
    const profitMarginPct = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

    // Breakdown by payment method
    const paymentBreakdown = db.prepare(`
      SELECT 
        s.payment_method,
        COUNT(*) as count,
        COALESCE(SUM(s.total_amount), 0) as total_volume
      FROM sales s
      ${filter}
      GROUP BY s.payment_method
      ORDER BY total_volume DESC
    `).all(...params);

    // Sales by day
    const dailyTrend = db.prepare(`
      SELECT 
        DATE(s.created_at) as sale_date,
        COUNT(*) as invoice_count,
        COALESCE(SUM(s.total_amount), 0) as daily_total
      FROM sales s
      ${filter}
      GROUP BY DATE(s.created_at)
      ORDER BY sale_date DESC
      LIMIT 30
    `).all(...params);

    const dailyTrends = dailyTrend.map((d: any) => ({
      date: d.sale_date,
      total_sales: d.daily_total,
      total_profit: d.daily_total * 0.15,
      invoice_count: d.invoice_count
    }));

    res.json({
      summary: {
        totalInvoices: aggregates.total_invoices,
        grossSubtotal: Number(aggregates.gross_subtotal.toFixed(2)),
        totalDiscount: Number(aggregates.total_discount.toFixed(2)),
        totalTax: Number(aggregates.total_tax.toFixed(2)),
        netSales: Number(netSales.toFixed(2)),
        totalCogs: Number(totalCogs.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        profitMarginPct: Number(profitMarginPct.toFixed(2)),
        cashCollected: Number(aggregates.total_cash_collected.toFixed(2)),
        creditExtended: Number(aggregates.total_credit_extended.toFixed(2))
      },
      paymentBreakdown,
      dailyTrend,
      dailyTrends
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate sales summary report', details: err.message });
  }
});

// ==========================================
// 2. TOP SELLING MEDICINES
// ==========================================
reportRouter.get('/top-selling', reportingAuth, (req: Request, res: Response) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;

    let filter = " WHERE s.status = 'COMPLETED' ";
    const params: any[] = [];

    if (startDate) {
      filter += ' AND DATE(s.created_at) >= DATE(?) ';
      params.push(startDate);
    }
    if (endDate) {
      filter += ' AND DATE(s.created_at) <= DATE(?) ';
      params.push(endDate);
    }

    params.push(Number(limit));

    const topItems = db.prepare(`
      SELECT 
        m.id as medicine_id,
        m.brand_name,
        m.dosage_form,
        m.strength,
        c.name as category_name,
        SUM(si.quantity) as total_units_sold,
        SUM(si.line_total) as total_revenue,
        SUM(si.purchase_price_snapshot * si.quantity) as total_cost,
        (SUM(si.line_total) - SUM(si.purchase_price_snapshot * si.quantity)) as gross_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN medicines m ON si.medicine_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      ${filter}
      GROUP BY m.id
      ORDER BY total_units_sold DESC
      LIMIT ?
    `).all(...params);

    res.json({ topItems });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate top selling report', details: err.message });
  }
});

// ==========================================
// 3. CASHIER & COUNTER PERFORMANCE REPORT
// ==========================================
reportRouter.get('/cashier-performance', reportingAuth, (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let joinCondition = " AND s.status = 'COMPLETED' ";
    const params: any[] = [];

    if (startDate) {
      joinCondition += ' AND DATE(s.created_at) >= DATE(?) ';
      params.push(startDate);
    }
    if (endDate) {
      joinCondition += ' AND DATE(s.created_at) <= DATE(?) ';
      params.push(endDate);
    }

    const performance = db.prepare(`
      SELECT 
        u.id as user_id,
        u.username,
        u.full_name,
        COUNT(s.id) as total_transactions,
        COALESCE(SUM(s.total_amount), 0) as total_sales_volume,
        COALESCE(SUM(s.discount), 0) as total_discounts_granted,
        COALESCE(AVG(s.total_amount), 0) as average_bill_value
      FROM users u
      LEFT JOIN sales s ON u.id = s.cashier_id ${joinCondition}
      GROUP BY u.id
      ORDER BY total_sales_volume DESC
    `).all(...params);

    res.json({ performance });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate cashier performance report', details: err.message });
  }
});

// ==========================================
// 4. INVENTORY VALUATION REPORT
// ==========================================
reportRouter.get('/inventory-valuation', reportingAuth, (req: Request, res: Response) => {
  try {
    // Total aggregate valuation
    const totals = db.prepare(`
      SELECT 
        COUNT(DISTINCT b.medicine_id) as total_distinct_medicines,
        COUNT(b.id) as total_active_batches,
        COALESCE(SUM(b.quantity), 0) as total_stock_units,
        COALESCE(SUM(b.quantity * b.purchase_price), 0) as total_cost_valuation,
        COALESCE(SUM(b.quantity * b.sale_price), 0) as total_retail_valuation
      FROM batches b
      WHERE b.quantity > 0 AND b.status = 'ACTIVE'
    `).get() as any;

    const totalCost = Number(totals.total_cost_valuation || 0);
    const totalRetail = Number(totals.total_retail_valuation || 0);
    const unrealizedProfit = totalRetail - totalCost;
    const unrealizedMarginPct = totalRetail > 0 ? (unrealizedProfit / totalRetail) * 100 : 0;

    // Valuation by category
    const categoryBreakdown = db.prepare(`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category_name,
        COUNT(DISTINCT m.id) as medicine_count,
        COALESCE(SUM(b.quantity), 0) as stock_units,
        COALESCE(SUM(b.quantity * b.purchase_price), 0) as cost_value,
        COALESCE(SUM(b.quantity * b.sale_price), 0) as retail_value
      FROM batches b
      JOIN medicines m ON b.medicine_id = m.id
      LEFT JOIN categories c ON m.category_id = c.id
      WHERE b.quantity > 0 AND b.status = 'ACTIVE'
      GROUP BY c.id
      ORDER BY cost_value DESC
    `).all();

    res.json({
      summary: {
        distinctMedicines: totals.total_distinct_medicines,
        activeBatches: totals.total_active_batches,
        totalStockUnits: totals.total_stock_units,
        totalCostValuation: Number(totalCost.toFixed(2)),
        totalRetailValuation: Number(totalRetail.toFixed(2)),
        unrealizedProfit: Number(unrealizedProfit.toFixed(2)),
        unrealizedMarginPct: Number(unrealizedMarginPct.toFixed(2))
      },
      categoryBreakdown
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate inventory valuation report', details: err.message });
  }
});

// ==========================================
// 5. DEAD STOCK / SLOW MOVING INVENTORY
// ==========================================
reportRouter.get('/dead-stock', reportingAuth, (req: Request, res: Response) => {
  try {
    const days = parseInt((req.query.days as string) || '60', 10);

    // Find batches that have quantity > 0 and no sales within last `days` days
    const deadStock = db.prepare(`
      SELECT 
        b.id as batch_id,
        b.batch_number,
        b.expiry_date,
        b.quantity,
        b.purchase_price,
        b.sale_price,
        (b.quantity * b.purchase_price) as tied_up_capital,
        m.id as medicine_id,
        m.brand_name,
        m.strength,
        m.dosage_form,
        m.rack_location,
        s.name as supplier_name,
        MAX(sale.created_at) as last_sold_date
      FROM batches b
      JOIN medicines m ON b.medicine_id = m.id
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      LEFT JOIN sale_items si ON b.id = si.batch_id
      LEFT JOIN sales sale ON si.sale_id = sale.id
      WHERE b.quantity > 0 AND b.status = 'ACTIVE'
      GROUP BY b.id
      HAVING last_sold_date IS NULL OR DATE(last_sold_date) < DATE('now', '-' || ? || ' days')
      ORDER BY tied_up_capital DESC
    `).all(days);

    const totalTiedUpCapital = deadStock.reduce((acc: number, item: any) => acc + (item.tied_up_capital || 0), 0);

    res.json({
      daysThreshold: days,
      itemCount: deadStock.length,
      totalTiedUpCapital: Number(totalTiedUpCapital.toFixed(2)),
      deadStock
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate dead stock report', details: err.message });
  }
});

// ==========================================
// 6. CUSTOMER CREDIT / UDHAR AGING REPORT
// ==========================================
reportRouter.get('/customer-credit', reportingAuth, (req: Request, res: Response) => {
  try {
    const customers = db.prepare(`
      SELECT 
        c.id,
        c.name,
        c.mobile,
        c.credit_limit,
        c.current_balance,
        MAX(s.created_at) as last_purchase_date,
        MAX(cl.created_at) as last_payment_date
      FROM customers c
      LEFT JOIN sales s ON c.id = s.customer_id
      LEFT JOIN customer_ledgers cl ON c.id = cl.customer_id AND cl.transaction_type = 'PAYMENT_RECEIVED'
      WHERE c.current_balance > 0
      GROUP BY c.id
      ORDER BY c.current_balance DESC
    `).all();

    const totalOutstanding = customers.reduce((acc: number, c: any) => acc + c.current_balance, 0);

    res.json({
      totalOutstanding: Number(totalOutstanding.toFixed(2)),
      customerCount: customers.length,
      customers
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate customer credit report', details: err.message });
  }
});

// ==========================================
// 7. SUPPLIER PAYABLES REPORT
// ==========================================
reportRouter.get('/supplier-payables', reportingAuth, (req: Request, res: Response) => {
  try {
    const suppliers = db.prepare(`
      SELECT 
        s.id,
        s.name,
        s.contact_person,
        s.phone,
        s.current_balance,
        MAX(p.created_at) as last_purchase_date,
        MAX(sl.created_at) as last_payment_date
      FROM suppliers s
      LEFT JOIN purchases p ON s.id = p.supplier_id
      LEFT JOIN supplier_ledgers sl ON s.id = sl.supplier_id AND sl.transaction_type = 'PAYMENT_OUT'
      WHERE s.current_balance > 0
      GROUP BY s.id
      ORDER BY s.current_balance DESC
    `).all();

    const totalPayables = suppliers.reduce((acc: number, s: any) => acc + s.current_balance, 0);

    res.json({
      totalPayables: Number(totalPayables.toFixed(2)),
      supplierCount: suppliers.length,
      suppliers
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate supplier payables report', details: err.message });
  }
});

// ==========================================
// 8. CSV EXPORT UTILITY
// ==========================================
reportRouter.get('/export-csv', reportingAuth, (req: Request, res: Response) => {
  try {
    const { type = 'inventory' } = req.query;

    let csv = '';
    let filename = `nmp-${type}-${new Date().toISOString().split('T')[0]}.csv`;

    if (type === 'inventory') {
      csv = 'Medicine Name,Strength,Dosage Form,Category,Batch Number,Expiry Date,Stock Quantity,Purchase Price,Sale Price,Valuation (Cost),Valuation (Retail)\n';
      const rows = db.prepare(`
        SELECT 
          m.brand_name, m.strength, m.dosage_form, c.name as category,
          b.batch_number, b.expiry_date, b.quantity, b.purchase_price, b.sale_price,
          (b.quantity * b.purchase_price) as cost_val,
          (b.quantity * b.sale_price) as retail_val
        FROM batches b
        JOIN medicines m ON b.medicine_id = m.id
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE b.quantity > 0
        ORDER BY m.brand_name ASC
      `).all() as any[];

      rows.forEach((r) => {
        csv += `"${r.brand_name}","${r.strength || ''}","${r.dosage_form || ''}","${r.category || ''}","${r.batch_number}","${r.expiry_date}",${r.quantity},${r.purchase_price},${r.sale_price},${r.cost_val},${r.retail_val}\n`;
      });
    } else if (type === 'sales') {
      csv = 'Invoice Number,Date,Customer,Subtotal,Discount,Tax,Total,Paid,Payment Method,Status\n';
      const rows = db.prepare(`
        SELECT 
          s.invoice_number, s.created_at, c.name as customer_name,
          s.subtotal, s.discount, s.tax, s.total_amount, s.paid_amount, s.payment_method, s.status
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        ORDER BY s.created_at DESC
      `).all() as any[];

      rows.forEach((r) => {
        csv += `"${r.invoice_number}","${r.created_at}","${r.customer_name || 'Walk-in'}",${r.subtotal},${r.discount},${r.tax},${r.total_amount},${r.paid_amount},"${r.payment_method}","${r.status}"\n`;
      });
    } else if (type === 'customer-credit') {
      csv = 'Customer Name,Mobile,Credit Limit,Current Outstanding Balance\n';
      const rows = db.prepare(`
        SELECT name, mobile, credit_limit, current_balance 
        FROM customers WHERE current_balance > 0 
        ORDER BY current_balance DESC
      `).all() as any[];

      rows.forEach((r) => {
        csv += `"${r.name}","${r.mobile || ''}",${r.credit_limit},${r.current_balance}\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to export CSV', details: err.message });
  }
});
