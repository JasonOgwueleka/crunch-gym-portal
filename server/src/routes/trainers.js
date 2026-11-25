import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, toInt, blankToNull } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();

// Public list of trainers (for the timetable / plans pages and admin pickers)
router.get('/', async (req, res) => {
  const { rows } = await query(
    `select u.id, u.full_name, tp.bio, tp.specialties,
            (select count(*) from gym_v1.trainer_assignments ta where ta.trainer_id = u.id)::int as client_count,
            (select count(*) from gym_v1.certifications c where c.trainer_id = u.id and c.status = 'approved')::int as approved_certifications
       from gym_v1.users u
       left join gym_v1.trainer_profiles tp on tp.user_id = u.id
      where u.role = 'trainer' and u.is_active
      order by u.full_name`,
  );
  res.json(rows);
});

router.get('/me/profile', requireRole('trainer'), async (req, res) => {
  const profile = await one('select * from gym_v1.trainer_profiles where user_id = $1', [req.user.id]);
  res.json(profile || { user_id: req.user.id, bio: null, specialties: null });
});

router.put('/me/profile', requireRole('trainer'), async (req, res) => {
  const profile = await one(
    `insert into gym_v1.trainer_profiles (user_id, bio, specialties) values ($1, $2, $3)
     on conflict (user_id) do update set bio = excluded.bio, specialties = excluded.specialties
     returning *`,
    [req.user.id, blankToNull(req.body?.bio), blankToNull(req.body?.specialties)],
  );
  await audit(req, 'trainer.update_profile', 'trainer_profile', req.user.id);
  res.json(profile);
});

router.get('/:id', async (req, res) => {
  const row = await one(
    `select u.id, u.full_name, tp.bio, tp.specialties
       from gym_v1.users u left join gym_v1.trainer_profiles tp on tp.user_id = u.id
      where u.id = $1 and u.role = 'trainer' and u.is_active`,
    [toInt(req.params.id)],
  );
  if (!row) throw notFound('Trainer not found');
  res.json(row);
});

export default router;
