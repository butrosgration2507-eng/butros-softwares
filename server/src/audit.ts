import type { Queryable } from './db.js';

export type Actor = { id: string; email: string };

export async function audit(db: Queryable, actor: Actor | null, action: string, entityType?: string, entityId?: string, details: Record<string, unknown> = {}) {
  // Never put tokens, passwords or secrets in `details`.
  await db.query(
    'insert into audit_logs(admin_id, admin_email, action, entity_type, entity_id, details) values ($1,$2,$3,$4,$5,$6::jsonb)',
    [actor?.id ?? null, actor?.email ?? null, action, entityType ?? null, entityId ?? null, JSON.stringify(details)],
  );
}
