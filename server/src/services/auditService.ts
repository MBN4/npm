import { db } from '../db/index.js';

export interface AuditEntry {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  oldValues?: any;
  newValues?: any;
  details?: any;
  ipAddress?: string;
}

export function logAudit(entry: AuditEntry): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const newVals = entry.newValues ?? entry.details ?? null;

    stmt.run(
      entry.userId || null,
      entry.action,
      entry.entity,
      entry.entityId != null ? String(entry.entityId) : null,
      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      newVals ? JSON.stringify(newVals) : null,
      entry.ipAddress || null
    );
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
}
