import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import morgan from 'morgan';
import { config, PROJECT_ROOT } from './config.js';
import { pool } from './db.js';
import { loadUser } from './middleware/auth.js';
import { SESSION_COOKIE } from './utils/session.js';
import { csrfProtection } from './utils/csrf.js';
import { errorHandler } from './utils/http.js';

import authRoutes from './routes/auth.js';
import planRoutes from './routes/plans.js';
import userRoutes from './routes/users.js';
import trainerRoutes from './routes/trainers.js';
import membershipRoutes from './routes/memberships.js';
import paymentRoutes from './routes/payments.js';
import classRoutes from './routes/classes.js';
import availabilityRoutes from './routes/availability.js';
import ptSessionRoutes from './routes/ptSessions.js';
import clientRoutes from './routes/clients.js';
import workoutPlanRoutes from './routes/workoutPlans.js';
import sessionNoteRoutes from './routes/sessionNotes.js';
import progressRoutes from './routes/progress.js';
import healthRoutes from './routes/health.js';
import messageRoutes from './routes/messages.js';
import certificationRoutes from './routes/certifications.js';
import checkinRoutes from './routes/checkins.js';
import assignmentRoutes from './routes/assignments.js';
import adminRoutes from './routes/admin.js';

const app = express();
const PgSession = connectPgSimple(session);

// SEC-01: X-Forwarded-For is only trusted when TRUST_PROXY is configured
// (i.e. a real reverse proxy sets it). Otherwise req.ip is the socket address,
// so clients cannot spoof their IP to get around the per-IP rate limit.
app.set('trust proxy', config.trustProxy);
app.use(morgan('dev'));
app.use(express.json());
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.use(
  session({
    store: new PgSession({
      pool,
      schemaName: 'gym_v1',
      tableName: 'user_sessions',
      createTableIfMissing: false,
    }),
    name: SESSION_COOKIE,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    // SEC-05: the idle and absolute timeouts are enforced server-side in loadUser
    // (middleware/auth.js) from timestamps stored in the session, so a cookie that is
    // still held by the browser is refused once either limit has passed.
    cookie: {
      httpOnly: true, // not readable from JavaScript
      sameSite: 'strict', // never sent on cross-site requests
      secure: config.cookieSecure, // HTTPS-only when NODE_ENV=production
      maxAge: config.sessionAbsoluteMs,
    },
  }),
);

app.use(loadUser);

// SEC-06: every POST/PUT/PATCH/DELETE under /api needs a valid CSRF token.
// Runs before all routers (and before multer), so a rejected request does nothing.
app.use('/api', csrfProtection);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/pt-sessions', ptSessionRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/workout-plans', workoutPlanRoutes);
app.use('/api/session-notes', sessionNoteRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/health-questionnaire', healthRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/certifications', certificationRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app (client/dist) and let it handle routing.
const clientDist = path.join(PROJECT_ROOT, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Crunch Gym API listening on http://localhost:${config.port}`);
});
