import { one } from '../db.js';
import { forbidden } from './http.js';

/** SQL expression: does user `alias`.id have an active membership today? */
export const ACTIVE_MEMBERSHIP_SQL = (alias = 'u') => `exists (
  select 1 from gym_v1.memberships am
   where am.user_id = ${alias}.id
     and am.status = 'active'
     and current_date between am.start_date and am.end_date)`;

export async function hasActiveMembership(userId, db = null) {
  const sql = `select exists (
      select 1 from gym_v1.memberships
       where user_id = $1 and status = 'active'
         and current_date between start_date and end_date) as active`;
  const row = db ? (await db.query(sql, [userId])).rows[0] : await one(sql, [userId]);
  return Boolean(row?.active);
}

export async function getAssignedTrainerId(memberId) {
  const row = await one('select trainer_id from gym_v1.trainer_assignments where member_id = $1', [memberId]);
  return row?.trainer_id ?? null;
}

export async function isAssigned(trainerId, memberId) {
  const row = await one(
    'select 1 from gym_v1.trainer_assignments where trainer_id = $1 and member_id = $2',
    [trainerId, memberId],
  );
  return Boolean(row);
}

/**
 * Who may view a member's training data (progress, health, plans)?
 * The member themself, their assigned trainer, or an admin.
 */
export async function assertCanViewMember(user, memberId) {
  if (user.role === 'admin') return;
  if (user.role === 'member' && user.id === memberId) return;
  if (user.role === 'trainer' && (await isAssigned(user.id, memberId))) return;
  throw forbidden('You can only view your own clients');
}

/** Trainers may only manage data for members assigned to them; admins may manage anyone. */
export async function assertTrainerOf(user, memberId) {
  if (user.role === 'admin') return;
  if (user.role === 'trainer' && (await isAssigned(user.id, memberId))) return;
  throw forbidden('This member is not assigned to you');
}

/** Add whole months to a 'YYYY-MM-DD' date string, returning a new 'YYYY-MM-DD' string. */
export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  // Clamp e.g. Jan 31 + 1 month to Feb 28/29
  if (dt.getUTCDate() !== d) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function todayStr() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
