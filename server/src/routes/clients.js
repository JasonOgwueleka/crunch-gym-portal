import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, toInt } from '../utils/http.js';
import { ACTIVE_MEMBERSHIP_SQL, assertTrainerOf } from '../utils/domain.js';

/** Trainer view of the members assigned to them (admins can see any member). */
const router = Router();
router.use(requireRole('trainer', 'admin'));

router.get('/', async (req, res) => {
  const params = [];
  let where = `u.role = 'member'`;
  if (req.user.role === 'trainer') {
    params.push(req.user.id);
    where += ` and ta.trainer_id = $1`;
  }
  const { rows } = await query(
    `select u.id, u.full_name, u.email, u.phone, ta.assigned_at, ta.notes as assignment_notes,
            ${ACTIVE_MEMBERSHIP_SQL('u')} as membership_active,
            (select max(log_date) from gym_v1.progress_logs pl where pl.member_id = u.id) as last_progress_on,
            (select min(start_at) from gym_v1.pt_sessions s
              where s.member_id = u.id and s.status = 'booked' and s.start_at > now()) as next_session_at,
            exists (select 1 from gym_v1.health_questionnaires h where h.member_id = u.id) as has_questionnaire
       from gym_v1.users u
       ${req.user.role === 'trainer' ? 'join' : 'left join'} gym_v1.trainer_assignments ta on ta.member_id = u.id
      where ${where}
      order by u.full_name`,
    params,
  );
  res.json(rows);
});

router.get('/:memberId', async (req, res) => {
  const memberId = toInt(req.params.memberId);
  await assertTrainerOf(req.user, memberId);
  const member = await one(
    `select u.id, u.full_name, u.email, u.phone, u.date_of_birth, u.created_at,
            ${ACTIVE_MEMBERSHIP_SQL('u')} as membership_active,
            ta.assigned_at, ta.notes as assignment_notes
       from gym_v1.users u left join gym_v1.trainer_assignments ta on ta.member_id = u.id
      where u.id = $1 and u.role = 'member'`,
    [memberId],
  );
  if (!member) throw notFound('Member not found');
  const [health, logs, photos, plans, notes, sessions] = await Promise.all([
    one('select * from gym_v1.health_questionnaires where member_id = $1', [memberId]),
    query('select * from gym_v1.progress_logs where member_id = $1 order by log_date desc', [memberId]),
    query('select id, caption, taken_on, original_name, created_at from gym_v1.progress_photos where member_id = $1 order by taken_on desc', [memberId]),
    query('select * from gym_v1.workout_plans where member_id = $1 order by created_at desc', [memberId]),
    query('select * from gym_v1.session_notes where member_id = $1 order by created_at desc', [memberId]),
    query('select * from gym_v1.pt_sessions where member_id = $1 order by start_at desc', [memberId]),
  ]);
  res.json({
    member,
    health,
    progress_logs: logs.rows,
    progress_photos: photos.rows,
    workout_plans: plans.rows,
    session_notes: notes.rows,
    pt_sessions: sessions.rows,
  });
});

export default router;
