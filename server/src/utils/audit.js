import { query } from '../db.js';

/**
 * Record an action in the audit log. Failures are logged but never break the request.
 * `actor` defaults to the logged-in user.
 */
export async function audit(req, action, entityType, entityId, details = null, actor = req?.user) {
  try {
    await query(
      `insert into gym_v1.audit_logs
         (actor_id, actor_email, actor_role, action, entity_type, entity_id, details, ip_address)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actor?.id ?? null,
        actor?.email ?? null,
        actor?.role ?? null,
        action,
        entityType ?? null,
        entityId == null ? null : String(entityId),
        details ? JSON.stringify(details) : null,
        req?.ip ?? null,
      ],
    );
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}
