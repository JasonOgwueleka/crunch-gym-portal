import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden, toInt, buildUpdate, blankToNull } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { assertCanViewMember } from '../utils/domain.js';
import { uploader, UPLOAD_SUBDIRS, removeStoredFile, sendStoredFile } from '../utils/uploads.js';

const router = Router();
const LOG_FIELDS = ['log_date', 'weight_kg', 'body_fat_pct', 'waist_cm', 'notes'];
const upload = uploader(UPLOAD_SUBDIRS.progressPhotos);

/** Members see their own data; trainers/admins pass ?member_id=. */
async function targetMemberId(req) {
  if (req.user.role === 'member') return req.user.id;
  if (!req.query.member_id) throw badRequest('member_id is required');
  const memberId = toInt(req.query.member_id, 'member_id');
  await assertCanViewMember(req.user, memberId);
  return memberId;
}

function assertOwnerOrAdmin(user, memberId) {
  if (user.role === 'admin') return;
  if (user.role === 'member' && user.id === memberId) return;
  throw forbidden();
}

// ---- Progress logs --------------------------------------------------------

router.get('/logs', requireAuth, async (req, res) => {
  const memberId = await targetMemberId(req);
  const { rows } = await query('select * from gym_v1.progress_logs where member_id = $1 order by log_date desc, id desc', [memberId]);
  res.json(rows);
});

router.get('/logs/:id', requireAuth, async (req, res) => {
  const log = await one('select * from gym_v1.progress_logs where id = $1', [toInt(req.params.id)]);
  if (!log) throw notFound('Log not found');
  await assertCanViewMember(req.user, log.member_id);
  res.json(log);
});

router.post('/logs', requireRole('member'), async (req, res) => {
  const b = req.body || {};
  if ([b.weight_kg, b.body_fat_pct, b.waist_cm, b.notes].every((v) => v === undefined || v === null || v === '')) {
    throw badRequest('Enter at least one measurement or a note');
  }
  const log = await one(
    `insert into gym_v1.progress_logs (member_id, log_date, weight_kg, body_fat_pct, waist_cm, notes)
     values ($1, coalesce($2::date, current_date), $3, $4, $5, $6) returning *`,
    [req.user.id, b.log_date || null, blankToNull(b.weight_kg), blankToNull(b.body_fat_pct), blankToNull(b.waist_cm), b.notes || null],
  );
  await audit(req, 'progress_log.create', 'progress_log', log.id);
  res.status(201).json(log);
});

router.put('/logs/:id', requireRole('member', 'admin'), async (req, res) => {
  const log = await one('select * from gym_v1.progress_logs where id = $1', [toInt(req.params.id)]);
  if (!log) throw notFound('Log not found');
  assertOwnerOrAdmin(req.user, log.member_id);
  const { sets, values } = buildUpdate(req.body, LOG_FIELDS, 2);
  if (!sets.length) throw badRequest('Nothing to update');
  const updated = await one(`update gym_v1.progress_logs set ${sets.join(', ')} where id = $1 returning *`, [log.id, ...values]);
  await audit(req, 'progress_log.update', 'progress_log', log.id);
  res.json(updated);
});

router.delete('/logs/:id', requireRole('member', 'admin'), async (req, res) => {
  const log = await one('select * from gym_v1.progress_logs where id = $1', [toInt(req.params.id)]);
  if (!log) throw notFound('Log not found');
  assertOwnerOrAdmin(req.user, log.member_id);
  await query('delete from gym_v1.progress_logs where id = $1', [log.id]);
  await audit(req, 'progress_log.delete', 'progress_log', log.id);
  res.json({ ok: true });
});

// ---- Progress photos ------------------------------------------------------

router.get('/photos', requireAuth, async (req, res) => {
  const memberId = await targetMemberId(req);
  const { rows } = await query(
    `select id, member_id, original_name, mime_type, size_bytes, caption, taken_on, created_at
       from gym_v1.progress_photos where member_id = $1 order by taken_on desc, id desc`,
    [memberId],
  );
  res.json(rows);
});

router.post('/photos', requireRole('member'), upload.single('photo'), async (req, res) => {
  if (!req.file) throw badRequest('Choose a photo to upload');
  const photo = await one(
    `insert into gym_v1.progress_photos (member_id, stored_name, original_name, mime_type, size_bytes, caption, taken_on)
     values ($1, $2, $3, $4, $5, $6, coalesce($7::date, current_date))
     returning id, member_id, original_name, mime_type, size_bytes, caption, taken_on, created_at`,
    [req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.body.caption || null, req.body.taken_on || null],
  );
  await audit(req, 'progress_photo.upload', 'progress_photo', photo.id, { original_name: photo.original_name });
  res.status(201).json(photo);
});

router.get('/photos/:id/file', requireAuth, async (req, res) => {
  const photo = await one('select * from gym_v1.progress_photos where id = $1', [toInt(req.params.id)]);
  if (!photo) throw notFound('Photo not found');
  await assertCanViewMember(req.user, photo.member_id);
  sendStoredFile(res, UPLOAD_SUBDIRS.progressPhotos, photo);
});

router.put('/photos/:id', requireRole('member', 'admin'), async (req, res) => {
  const photo = await one('select * from gym_v1.progress_photos where id = $1', [toInt(req.params.id)]);
  if (!photo) throw notFound('Photo not found');
  assertOwnerOrAdmin(req.user, photo.member_id);
  const { sets, values } = buildUpdate(req.body, ['caption', 'taken_on'], 2);
  if (!sets.length) throw badRequest('Nothing to update');
  const updated = await one(
    `update gym_v1.progress_photos set ${sets.join(', ')} where id = $1
     returning id, member_id, original_name, mime_type, size_bytes, caption, taken_on, created_at`,
    [photo.id, ...values],
  );
  await audit(req, 'progress_photo.update', 'progress_photo', photo.id);
  res.json(updated);
});

router.delete('/photos/:id', requireRole('member', 'admin'), async (req, res) => {
  const photo = await one('select * from gym_v1.progress_photos where id = $1', [toInt(req.params.id)]);
  if (!photo) throw notFound('Photo not found');
  assertOwnerOrAdmin(req.user, photo.member_id);
  await query('delete from gym_v1.progress_photos where id = $1', [photo.id]);
  removeStoredFile(UPLOAD_SUBDIRS.progressPhotos, photo.stored_name);
  await audit(req, 'progress_photo.delete', 'progress_photo', photo.id);
  res.json({ ok: true });
});

export default router;
