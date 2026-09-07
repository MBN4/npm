import { db } from '../db/index.js';

export interface AuditEntry {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
}

export function logAudit(entry: AuditEntry): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.userId || null,
      entry.action,
      entry.entity,
      entry.entityId != null ? String(entry.entityId) : null,
      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      entry.newValues ? JSON.stringify(entry.newValues) : null,
      entry.ipAddress || null
    );
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
}
