import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden, requireFields, toInt } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { isAssigned } from '../utils/domain.js';

/** Messaging between a member and their assigned trainer. */
const router = Router();
router.use(requireRole('member', 'trainer'));

async function canMessage(user, otherId) {
  if (user.role === 'member') return isAssigned(otherId, user.id);
  if (user.role === 'trainer') return isAssigned(user.id, otherId);
  return false;
}

// People this user can message, with unread counts and the latest message
router.get('/contacts', async (req, res) => {
  const me = req.user.id;
  const contactsSql = req.user.role === 'member'
    ? `select t.id, t.full_name, t.role from gym_v1.trainer_assignments ta
         join gym_v1.users t on t.id = ta.trainer_id where ta.member_id = $1`
    : `select m.id, m.full_name, m.role from gym_v1.trainer_assignments ta
         join gym_v1.users m on m.id = ta.member_id where ta.trainer_id = $1`;
  const { rows } = await query(
    `with c as (${contactsSql})
     select c.*,
            (select count(*) from gym_v1.messages x
              where x.sender_id = c.id and x.recipient_id = $1 and x.read_at is null)::int as unread,
            (select x.body from gym_v1.messages x
              where (x.sender_id = c.id and x.recipient_id = $1) or (x.sender_id = $1 and x.recipient_id = c.id)
              order by x.created_at desc limit 1) as last_message,
            (select max(x.created_at) from gym_v1.messages x
              where (x.sender_id = c.id and x.recipient_id = $1) or (x.sender_id = $1 and x.recipient_id = c.id)) as last_at
       from c order by last_at desc nulls last, c.full_name`,
    [me],
  );
  res.json(rows);
});

router.get('/unread-count', async (req, res) => {
  const row = await one('select count(*)::int as n from gym_v1.messages where recipient_id = $1 and read_at is null', [req.user.id]);
  res.json({ unread: row.n });
});

router.get('/thread/:userId', async (req, res) => {
  const other = toInt(req.params.userId, 'userId');
  if (!(await canMessage(req.user, other))) throw forbidden('You can only message your trainer or your clients');
  const { rows } = await query(
    `select * from gym_v1.messages
      where (sender_id = $1 and recipient_id = $2) or (sender_id = $2 and recipient_id = $1)
      order by created_at`,
    [req.user.id, other],
  );
  await query('update gym_v1.messages set read_at = now() where sender_id = $2 and recipient_id = $1 and read_at is null', [req.user.id, other]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['recipient_id', 'body']);
  const recipientId = toInt(req.body.recipient_id, 'recipient_id');
  if (!(await canMessage(req.user, recipientId))) throw forbidden('You can only message your trainer or your clients');
  const msg = await one(
    'insert into gym_v1.messages (sender_id, recipient_id, body) values ($1, $2, $3) returning *',
    [req.user.id, recipientId, String(req.body.body).trim()],
  );
  await audit(req, 'message.send', 'message', msg.id, { recipient_id: recipientId });
  res.status(201).json(msg);
});

async function loadOwnMessage(req) {
  const msg = await one('select * from gym_v1.messages where id = $1', [toInt(req.params.id)]);
  if (!msg) throw notFound('Message not found');
  if (msg.sender_id !== req.user.id) throw forbidden('You can only change messages you sent');
  return msg;
}

router.put('/:id', async (req, res) => {
  const msg = await loadOwnMessage(req);
  if (!req.body?.body || !String(req.body.body).trim()) throw badRequest('Message cannot be empty');
  const updated = await one('update gym_v1.messages set body = $2 where id = $1 returning *', [msg.id, String(req.body.body).trim()]);
  await audit(req, 'message.edit', 'message', msg.id);
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const msg = await loadOwnMessage(req);
  await query('delete from gym_v1.messages where id = $1', [msg.id]);
  await audit(req, 'message.delete', 'message', msg.id);
  res.json({ ok: true });
});

export default router;
