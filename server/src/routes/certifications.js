import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden, requireFields, toInt, blankToNull } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { sendEmail } from '../utils/mailer.js';
import { uploader, verifyUpload, UPLOAD_SUBDIRS, removeStoredFile, sendStoredFile } from '../utils/uploads.js';

const router = Router();
const upload = uploader(UPLOAD_SUBDIRS.certifications);

const SELECT = `
  select c.id, c.trainer_id, c.title, c.issuer, c.issued_on, c.expires_on, c.original_name, c.mime_type,
         c.size_bytes, c.status, c.review_notes, c.reviewed_by, c.reviewed_at, c.created_at, c.updated_at,
         t.full_name as trainer_name, r.full_name as reviewed_by_name
    from gym_v1.certifications c
    join gym_v1.users t on t.id = c.trainer_id
    left join gym_v1.users r on r.id = c.reviewed_by`;

router.get('/', requireRole('trainer', 'admin'), async (req, res) => {
  let rows;
  if (req.user.role === 'trainer') {
    ({ rows } = await query(`${SELECT} where c.trainer_id = $1 order by c.created_at desc`, [req.user.id]));
  } else {
    ({ rows } = await query(
      `${SELECT} where ($1::text is null or c.status = $1)
        order by case c.status when 'pending' then 0 else 1 end, c.created_at desc`,
      [req.query.status || null],
    ));
  }
  res.json(rows);
});

async function loadCert(req) {
  const cert = await one('select * from gym_v1.certifications where id = $1', [toInt(req.params.id)]);
  if (!cert) throw notFound('Certification not found');
  if (req.user.role === 'trainer' && cert.trainer_id !== req.user.id) throw forbidden();
  return cert;
}

router.get('/:id', requireRole('trainer', 'admin'), async (req, res) => {
  const cert = await loadCert(req);
  res.json(await one(`${SELECT} where c.id = $1`, [cert.id]));
});

router.get('/:id/file', requireAuth, requireRole('trainer', 'admin'), async (req, res) => {
  const cert = await loadCert(req);
  if (!cert.stored_name) throw notFound('No document was uploaded for this certification');
  sendStoredFile(res, UPLOAD_SUBDIRS.certifications, cert);
});

// SEC-10: verifyUpload checks the real file type (magic bytes) before anything is stored
router.post('/', requireRole('trainer'), upload.single('document'), verifyUpload(UPLOAD_SUBDIRS.certifications), async (req, res) => {
  requireFields(req.body, ['title']);
  if (!req.file) throw badRequest('Attach the certificate document');
  const b = req.body;
  const cert = await one(
    `insert into gym_v1.certifications
       (trainer_id, title, issuer, issued_on, expires_on, stored_name, original_name, mime_type, size_bytes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [req.user.id, b.title, blankToNull(b.issuer), blankToNull(b.issued_on), blankToNull(b.expires_on),
      req.file.filename, req.file.originalname, req.file.mimetype, req.file.size],
  );
  await audit(req, 'certification.upload', 'certification', cert.id, { title: b.title, file: req.file.originalname });
  res.status(201).json(await one(`${SELECT} where c.id = $1`, [cert.id]));
});

// Trainer edits details and may replace the document (goes back to pending review)
router.put('/:id', requireRole('trainer', 'admin'), upload.single('document'), verifyUpload(UPLOAD_SUBDIRS.certifications), async (req, res) => {
  const cert = await loadCert(req);
  const b = req.body || {};
  const newFile = req.file;
  const resetReview = req.user.role === 'trainer';
  await query(
    `update gym_v1.certifications set
        title = coalesce($2, title),
        issuer = $3,
        issued_on = $4,
        expires_on = $5,
        stored_name = coalesce($6, stored_name),
        original_name = coalesce($7, original_name),
        mime_type = coalesce($8, mime_type),
        size_bytes = coalesce($9, size_bytes),
        status = case when $10 then 'pending' else status end,
        review_notes = case when $10 then null else review_notes end,
        reviewed_by = case when $10 then null else reviewed_by end,
        reviewed_at = case when $10 then null else reviewed_at end
      where id = $1`,
    [
      cert.id,
      blankToNull(b.title),
      b.issuer === undefined ? cert.issuer : blankToNull(b.issuer),
      b.issued_on === undefined ? cert.issued_on : blankToNull(b.issued_on),
      b.expires_on === undefined ? cert.expires_on : blankToNull(b.expires_on),
      newFile?.filename ?? null,
      newFile?.originalname ?? null,
      newFile?.mimetype ?? null,
      newFile?.size ?? null,
      resetReview,
    ],
  );
  if (newFile) removeStoredFile(UPLOAD_SUBDIRS.certifications, cert.stored_name);
  await audit(req, 'certification.update', 'certification', cert.id, { replaced_file: Boolean(newFile) });
  res.json(await one(`${SELECT} where c.id = $1`, [cert.id]));
});

router.delete('/:id', requireRole('trainer', 'admin'), async (req, res) => {
  const cert = await loadCert(req);
  await query('delete from gym_v1.certifications where id = $1', [cert.id]);
  removeStoredFile(UPLOAD_SUBDIRS.certifications, cert.stored_name);
  await audit(req, 'certification.delete', 'certification', cert.id, { title: cert.title });
  res.json({ ok: true });
});

// Admin approves or rejects
router.patch('/:id/review', requireRole('admin'), async (req, res) => {
  const cert = await loadCert(req);
  const status = req.body?.status;
  if (!['approved', 'rejected', 'pending'].includes(status)) throw badRequest('Status must be approved, rejected or pending');
  await query(
    `update gym_v1.certifications set status = $2, review_notes = $3, reviewed_by = $4, reviewed_at = now() where id = $1`,
    [cert.id, status, blankToNull(req.body.review_notes), req.user.id],
  );
  const trainer = await one('select email, full_name from gym_v1.users where id = $1', [cert.trainer_id]);
  if (trainer && status !== 'pending') {
    sendEmail({
      to: trainer.email,
      subject: `Your certification "${cert.title}" was ${status}`,
      text: `Hi ${trainer.full_name},\n\nYour certification "${cert.title}" has been ${status}.\n${req.body.review_notes ? `Notes: ${req.body.review_notes}` : ''}`,
    });
  }
  await audit(req, `certification.${status === 'pending' ? 'reset' : status}`, 'certification', cert.id, { review_notes: req.body.review_notes });
  res.json(await one(`${SELECT} where c.id = $1`, [cert.id]));
});

export default router;
