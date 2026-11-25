import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound, requireFields, toInt, buildUpdate } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { assertTrainerOf } from '../utils/domain.js';

/** Trainer-only notes about assigned clients' sessions. Admins can read and manage them too. */
const router = Router();
router.use(requireRole('trainer', 'admin'));

const SELECT = `
  select n.*, t.full_name as trainer_name, m.full_name as member_name, s.start_at as session_start_at
    from gym_v1.session_notes n
    left join gym_v1.users t on t.id = n.trainer_id
    join gym_v1.users m on m.id = n.member_id
    left join gym_v1.pt_sessions s on s.id = n.pt_session_id`;

router.get('/', async (req, res) => {
  const memberId = req.query.member_id ? toInt(req.query.member_id, 'member_id') : null;
  let rows;
  if (req.user.role === 'trainer') {
    ({ rows } = await query(
      `${SELECT} join gym_v1.trainer_assignments ta on ta.member_id = n.member_id and ta.trainer_id = $1
        where ($2::int is null or n.member_id = $2) order by n.created_at desc`,
      [req.user.id, memberId],
    ));
  } else {
    ({ rows } = await query(`${SELECT} where ($1::int is null or n.member_id = $1) order by n.created_at desc`, [memberId]));
  }
  res.json(rows);
});

async function loadNote(req) {
  const note = await one(`${SELECT} where n.id = $1`, [toInt(req.params.id)]);
  if (!note) throw notFound('Note not found');
  await assertTrainerOf(req.user, note.member_id);
  return note;
}

router.get('/:id', async (req, res) => {
  res.json(await loadNote(req));
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['member_id', 'title', 'content']);
  const memberId = toInt(req.body.member_id, 'member_id');
  await assertTrainerOf(req.user, memberId);
  let sessionId = null;
  if (req.body.pt_session_id) {
    sessionId = toInt(req.body.pt_session_id, 'pt_session_id');
    const s = await one('select member_id from gym_v1.pt_sessions where id = $1', [sessionId]);
    if (!s || s.member_id !== memberId) throw badRequest('That session does not belong to this member');
  }
  const note = await one(
    `insert into gym_v1.session_notes (trainer_id, member_id, pt_session_id, title, content)
     values ($1, $2, $3, $4, $5) returning *`,
    [req.user.role === 'trainer' ? req.user.id : null, memberId, sessionId, req.body.title, req.body.content],
  );
  await audit(req, 'session_note.create', 'session_note', note.id, { member_id: memberId });
  res.status(201).json(note);
});

router.put('/:id', async (req, res) => {
  const note = await loadNote(req);
  const { sets, values } = buildUpdate(req.body, ['title', 'content', 'pt_session_id'], 2);
  if (!sets.length) throw badRequest('Nothing to update');
  const updated = await one(`update gym_v1.session_notes set ${sets.join(', ')} where id = $1 returning *`, [note.id, ...values]);
  await audit(req, 'session_note.update', 'session_note', note.id);
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const note = await loadNote(req);
  await query('delete from gym_v1.session_notes where id = $1', [note.id]);
  await audit(req, 'session_note.delete', 'session_note', note.id);
  res.json({ ok: true });
});

export default router;
