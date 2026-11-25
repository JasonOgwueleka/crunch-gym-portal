import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, toInt, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { assertCanViewMember } from '../utils/domain.js';

const router = Router();

const BOOL_FIELDS = [
  'has_heart_condition', 'has_chest_pain', 'has_dizziness', 'has_bone_joint_problem',
  'takes_medication', 'is_pregnant', 'smoker', 'consent',
];
const TEXT_FIELDS = [
  'medications', 'medical_conditions', 'injuries', 'activity_level', 'fitness_goals',
  'emergency_contact_name', 'emergency_contact_phone',
];
const ALL = [...BOOL_FIELDS, ...TEXT_FIELDS];

function values(body) {
  return ALL.map((f) => (BOOL_FIELDS.includes(f) ? Boolean(body?.[f]) : body?.[f] || null));
}

router.get('/mine', requireRole('member'), async (req, res) => {
  res.json(await one('select * from gym_v0.health_questionnaires where member_id = $1', [req.user.id]));
});

async function upsert(req, res) {
  if (!req.body?.consent) throw badRequest('Please confirm the declaration before saving');
  const cols = ALL.join(', ');
  const placeholders = ALL.map((_, i) => `$${i + 2}`).join(', ');
  const updates = ALL.map((f) => `${f} = excluded.${f}`).join(', ');
  const existing = await one('select id from gym_v0.health_questionnaires where member_id = $1', [req.user.id]);
  const row = await one(
    `insert into gym_v0.health_questionnaires (member_id, ${cols}) values ($1, ${placeholders})
     on conflict (member_id) do update set ${updates} returning *`,
    [req.user.id, ...values(req.body)],
  );
  await audit(req, existing ? 'health_questionnaire.update' : 'health_questionnaire.create', 'health_questionnaire', row.id);
  res.status(existing ? 200 : 201).json(row);
}

router.post('/mine', requireRole('member'), upsert);
router.put('/mine', requireRole('member'), upsert);

router.delete('/mine', requireRole('member'), async (req, res) => {
  const row = await one('delete from gym_v0.health_questionnaires where member_id = $1 returning id', [req.user.id]);
  if (!row) throw notFound('You have not filled in a questionnaire');
  await audit(req, 'health_questionnaire.delete', 'health_questionnaire', row.id);
  res.json({ ok: true });
});

// Trainer (assigned) or admin views a member's questionnaire
router.get('/member/:memberId', requireRole('trainer', 'admin'), async (req, res) => {
  const memberId = toInt(req.params.memberId);
  await assertCanViewMember(req.user, memberId);
  res.json(await one('select * from gym_v0.health_questionnaires where member_id = $1', [memberId]));
});

// Admin list of all questionnaires
router.get('/', requireRole('admin'), async (req, res) => {
  const { rows } = await query(
    `select h.*, u.full_name as member_name from gym_v0.health_questionnaires h
       join gym_v0.users u on u.id = h.member_id order by h.updated_at desc`,
  );
  res.json(rows);
});

export default router;
