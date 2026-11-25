import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, one, withTransaction } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound, requireFields, toInt, blankToNull } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { ACTIVE_MEMBERSHIP_SQL } from '../utils/domain.js';
import { publicUser } from './auth.js';

const router = Router();
const ROLES = ['member', 'trainer', 'front_desk', 'admin'];

router.use(requireRole('admin'));

router.get('/', async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.role) {
    params.push(req.query.role);
    where.push(`u.role = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    where.push(`(u.full_name ilike $${params.length} or u.email ilike $${params.length})`);
  }
  const { rows } = await query(
    `select u.id, u.email, u.full_name, u.phone, u.date_of_birth, u.role, u.is_active,
            u.last_login_at, u.created_at, ${ACTIVE_MEMBERSHIP_SQL('u')} as membership_active,
            t.full_name as assigned_trainer_name
       from gym_v0.users u
       left join gym_v0.trainer_assignments ta on ta.member_id = u.id
       left join gym_v0.users t on t.id = ta.trainer_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by u.created_at desc`,
    params,
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const user = await one('select * from gym_v0.users where id = $1', [toInt(req.params.id)]);
  if (!user) throw notFound('User not found');
  res.json(publicUser(user));
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['email', 'password', 'full_name', 'role']);
  const b = req.body;
  if (!ROLES.includes(b.role)) throw badRequest('Unknown role');
  const hash = await bcrypt.hash(String(b.password), 10);
  const user = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `insert into gym_v0.users (email, password_hash, full_name, phone, date_of_birth, role, is_active)
       values ($1, $2, $3, $4, $5, $6, coalesce($7, true)) returning *`,
      [String(b.email).trim().toLowerCase(), hash, b.full_name, blankToNull(b.phone), blankToNull(b.date_of_birth), b.role, b.is_active ?? null],
    );
    if (b.role === 'trainer') {
      await db.query('insert into gym_v0.trainer_profiles (user_id) values ($1) on conflict do nothing', [rows[0].id]);
    }
    return rows[0];
  });
  await audit(req, 'user.create', 'user', user.id, { email: user.email, role: user.role });
  res.status(201).json(publicUser(user));
});

router.put('/:id', async (req, res) => {
  const id = toInt(req.params.id);
  const existing = await one('select * from gym_v0.users where id = $1', [id]);
  if (!existing) throw notFound('User not found');
  const b = req.body || {};
  if (b.role !== undefined && !ROLES.includes(b.role)) throw badRequest('Unknown role');
  if (id === req.user.id && (b.role && b.role !== 'admin' || b.is_active === false)) {
    throw badRequest('You cannot remove your own admin access');
  }
  const hash = b.password ? await bcrypt.hash(String(b.password), 10) : null;
  const user = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `update gym_v0.users set
          email = coalesce($2, email),
          full_name = coalesce($3, full_name),
          phone = $4,
          date_of_birth = $5,
          role = coalesce($6, role),
          is_active = coalesce($7, is_active),
          password_hash = coalesce($8, password_hash)
        where id = $1 returning *`,
      [
        id,
        b.email ? String(b.email).trim().toLowerCase() : null,
        b.full_name || null,
        b.phone === undefined ? existing.phone : blankToNull(b.phone),
        b.date_of_birth === undefined ? existing.date_of_birth : blankToNull(b.date_of_birth),
        b.role || null,
        typeof b.is_active === 'boolean' ? b.is_active : null,
        hash,
      ],
    );
    if (rows[0].role === 'trainer') {
      await db.query('insert into gym_v0.trainer_profiles (user_id) values ($1) on conflict do nothing', [id]);
    }
    // A member who stops being a member no longer needs a trainer assignment
    if (existing.role === 'member' && rows[0].role !== 'member') {
      await db.query('delete from gym_v0.trainer_assignments where member_id = $1', [id]);
    }
    if (existing.role === 'trainer' && rows[0].role !== 'trainer') {
      await db.query('delete from gym_v0.trainer_assignments where trainer_id = $1', [id]);
    }
    return rows[0];
  });
  const changes = { ...b };
  if (changes.password) changes.password = '[changed]';
  if (existing.role !== user.role) changes.previous_role = existing.role;
  await audit(req, existing.role !== user.role ? 'user.role_change' : 'user.update', 'user', id, changes);
  res.json(publicUser(user));
});

router.delete('/:id', async (req, res) => {
  const id = toInt(req.params.id);
  if (id === req.user.id) throw badRequest('You cannot delete your own account here');
  const user = await one('delete from gym_v0.users where id = $1 returning *', [id]);
  if (!user) throw notFound('User not found');
  await audit(req, 'user.delete', 'user', id, { email: user.email, role: user.role });
  res.json({ ok: true });
});

export default router;
