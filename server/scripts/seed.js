/**
 * Seed the gym_v0 schema with synthetic data and one test account per role.
 *
 *   npm run db:seed
 *
 * WARNING: this TRUNCATES every table in gym_v0 (and clears the upload folders)
 * before inserting fresh data. It never touches any other schema.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/db.js';
import { config } from '../src/config.js';
import { UPLOAD_SUBDIRS } from '../src/utils/uploads.js';

// ---------------------------------------------------------------------------
// Test accounts (one per role). Visitors are anonymous and need no account.
// ---------------------------------------------------------------------------
const TEST_ACCOUNTS = [
  { role: 'admin', email: 'admin@crunchgym.test', password: 'Admin123!', full_name: 'Alex Admin', phone: '+353 1 555 0100' },
  { role: 'front_desk', email: 'frontdesk@crunchgym.test', password: 'FrontDesk123!', full_name: 'Fran Desk', phone: '+353 1 555 0101' },
  { role: 'trainer', email: 'trainer@crunchgym.test', password: 'Trainer123!', full_name: 'Taylor Trainer', phone: '+353 1 555 0102' },
  { role: 'member', email: 'member@crunchgym.test', password: 'Member123!', full_name: 'Morgan Member', phone: '+353 87 555 0103', date_of_birth: '1995-04-12' },
];
const SYNTHETIC_PASSWORD = 'Password123!';

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helpers so every seed run looks the same
// ---------------------------------------------------------------------------
let seed = 20261125;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const round1 = (n) => Math.round(n * 10) / 10;

const FIRST = ['Aoife', 'Liam', 'Saoirse', 'Conor', 'Niamh', 'Sean', 'Ciara', 'Darragh', 'Emma', 'Jack', 'Orla', 'Cian',
  'Sophie', 'Oisin', 'Grace', 'Adam', 'Roisin', 'James', 'Chloe', 'Finn', 'Leah', 'Eoin', 'Ava', 'Patrick'];
const LAST = ['Murphy', 'Kelly', 'Byrne', 'Ryan', "O'Brien", 'Walsh', 'Doyle', 'McCarthy', 'Gallagher', 'Kennedy',
  'Lynch', 'Murray', 'Quinn', 'Moore', 'Brennan', 'Nolan', 'Daly', 'Power', 'Farrell', 'Hayes'];

function dateStr(d) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function daysFromToday(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}
function at(dayOffset, hour, minute = 0) {
  const d = daysFromToday(dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function addMinutes(d, mins) {
  return new Date(d.getTime() + mins * 60000);
}
function addMonthsStr(str, months) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  if (dt.getUTCDate() !== d) dt.setUTCDate(0);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
const ref = () => `SIM-SEED-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

// ---------------------------------------------------------------------------
// Tiny placeholder files for uploads
// ---------------------------------------------------------------------------
function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A simple gradient PNG used as a placeholder progress photo. */
function makePng(w, h, [r1, g1, b1], [r2, g2, b2]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r1 + (r2 - r1) * t);
      raw[o + 1] = Math.round(g1 + (g2 - g1) * t);
      raw[o + 2] = Math.round(b1 + (b2 - b1) * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
/** A one-page PDF placeholder certificate. */
function makePdf(lines) {
  const text = lines
    .map((l, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 60 ${300 - i * 30} Td (${l.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 360] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

function writeUpload(subdir, ext, buf) {
  const name = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(config.uploadDir, subdir, name), buf);
  return { stored_name: name, size_bytes: buf.length };
}

function clearUploads() {
  for (const sub of Object.values(UPLOAD_SUBDIRS)) {
    const dir = path.join(config.uploadDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  }
}

// ---------------------------------------------------------------------------
// Bulk insert helper
// ---------------------------------------------------------------------------
async function insertMany(db, table, rows, returning = 'id') {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const out = [];
  const size = Math.max(1, Math.min(500, Math.floor(30000 / cols.length)));
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const values = [];
    const tuples = chunk.map((row) => {
      const ph = cols.map((c) => {
        values.push(row[c] instanceof Date ? row[c].toISOString() : row[c]);
        return `$${values.length}`;
      });
      return `(${ph.join(', ')})`;
    });
    const { rows: inserted } = await db.query(
      `insert into gym_v0.${table} (${cols.join(', ')}) values ${tuples.join(', ')} returning ${returning}`,
      values,
    );
    out.push(...inserted);
  }
  return out;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Seeding gym_v0 ...');
  const syntheticHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 10);
  const testHashes = await Promise.all(TEST_ACCOUNTS.map((a) => bcrypt.hash(a.password, 10)));

  clearUploads();

  await withTransaction(async (db) => {
    const { rows: tables } = await db.query(
      `select tablename from pg_tables where schemaname = 'gym_v0'`,
    );
    if (!tables.length) throw new Error('No tables found in gym_v0. Run database/migrations/001_create_schema.sql first.');
    await db.query(
      `truncate ${tables.map((t) => `gym_v0.${t.tablename}`).join(', ')} restart identity cascade`,
    );

    // ---- Users ----------------------------------------------------------
    const userRows = TEST_ACCOUNTS.map((a, i) => ({
      email: a.email,
      password_hash: testHashes[i],
      full_name: a.full_name,
      phone: a.phone,
      date_of_birth: a.date_of_birth || null,
      role: a.role,
      is_active: true,
      created_at: daysFromToday(-200),
    }));
    const extraTrainers = [
      ['Jordan Lift', 'jordan.lift'],
      ['Casey Flow', 'casey.flow'],
      ['Riley Pace', 'riley.pace'],
    ];
    for (const [name, handle] of extraTrainers) {
      userRows.push({
        email: `${handle}@crunchgym.test`, password_hash: syntheticHash, full_name: name,
        phone: `+353 1 555 0${between(200, 299)}`, date_of_birth: null, role: 'trainer', is_active: true,
        created_at: daysFromToday(-between(150, 400)),
      });
    }
    userRows.push({
      email: 'sam.desk@crunchgym.test', password_hash: syntheticHash, full_name: 'Sam Reception',
      phone: '+353 1 555 0150', date_of_birth: null, role: 'front_desk', is_active: true, created_at: daysFromToday(-90),
    });
    const usedNames = new Set();
    for (let i = 0; i < 24; i++) {
      let name;
      do name = `${pick(FIRST)} ${pick(LAST)}`; while (usedNames.has(name));
      usedNames.add(name);
      const handle = name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.');
      userRows.push({
        email: `${handle}@example.test`, password_hash: syntheticHash, full_name: name,
        phone: `+353 8${between(3, 9)} ${between(100, 999)} ${between(1000, 9999)}`,
        date_of_birth: `${between(1965, 2005)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
        role: 'member', is_active: i !== 23, created_at: daysFromToday(-between(10, 365)),
      });
    }
    const users = await insertMany(db, 'users', userRows, 'id, email, role, full_name');
    const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
    const admin = byEmail['admin@crunchgym.test'];
    const desk = byEmail['frontdesk@crunchgym.test'];
    const mainTrainer = byEmail['trainer@crunchgym.test'];
    const mainMember = byEmail['member@crunchgym.test'];
    const trainers = users.filter((u) => u.role === 'trainer');
    const members = users.filter((u) => u.role === 'member');
    const otherMembers = members.filter((m) => m.id !== mainMember.id);

    // ---- Trainer profiles -------------------------------------------------
    const bios = {
      [mainTrainer.id]: ['Strength coach with 8 years of experience helping beginners build confidence under the bar.', 'Strength, Hypertrophy, Beginners'],
    };
    const specialties = ['HIIT, Conditioning', 'Yoga, Mobility, Pilates', 'Running, Endurance, Spin'];
    await insertMany(db, 'trainer_profiles', trainers.map((t, i) => ({
      user_id: t.id,
      bio: bios[t.id]?.[0] || `${t.full_name.split(' ')[0]} loves helping members hit their goals with practical, sustainable training.`,
      specialties: bios[t.id]?.[1] || specialties[(i - 1 + specialties.length) % specialties.length],
    })), 'user_id');

    // ---- Plans ------------------------------------------------------------
    const plans = await insertMany(db, 'membership_plans', [
      { name: 'Basic Monthly', description: 'Gym floor access during staffed hours.', price_cents: 2999, duration_months: 1, features: 'Gym floor access\nLocker rooms\nFree induction', is_active: true },
      { name: 'Standard Quarterly', description: 'Three months of full access including group classes.', price_cents: 7999, duration_months: 3, features: 'Everything in Basic\nUnlimited group classes\nFitness app access', is_active: true },
      { name: 'Premium Annual', description: 'Best value: a full year with personal training check-ins.', price_cents: 29900, duration_months: 12, features: 'Everything in Standard\nMonthly PT check-in\nGuest passes x4\nTowel service', is_active: true },
      { name: 'Student Monthly', description: 'Discounted monthly plan for students with a valid student card.', price_cents: 1999, duration_months: 1, features: 'Gym floor access\nOff-peak classes', is_active: true },
      { name: 'Off-Peak Legacy', description: 'Retired off-peak plan kept for existing members.', price_cents: 2499, duration_months: 1, features: 'Weekday 10:00-16:00 access', is_active: false },
    ], 'id, name, price_cents, duration_months');
    const planByName = Object.fromEntries(plans.map((p) => [p.name, p]));

    // ---- Memberships + payments ------------------------------------------
    const membershipRows = [];
    const membershipPlans = [];
    // Main test member: active Standard Quarterly that started 20 days ago, plus an older expired Basic
    const mmStart = dateStr(daysFromToday(-20));
    membershipRows.push({ user_id: mainMember.id, plan_id: planByName['Basic Monthly'].id, status: 'expired', start_date: dateStr(daysFromToday(-80)), end_date: addMonthsStr(dateStr(daysFromToday(-80)), 1), auto_renew: false, cancelled_at: null });
    membershipPlans.push(planByName['Basic Monthly']);
    membershipRows.push({ user_id: mainMember.id, plan_id: planByName['Standard Quarterly'].id, status: 'active', start_date: mmStart, end_date: addMonthsStr(mmStart, 3), auto_renew: true, cancelled_at: null });
    membershipPlans.push(planByName['Standard Quarterly']);

    const activeMemberIds = new Set([mainMember.id]);
    otherMembers.forEach((m, i) => {
      const plan = pick(plans.slice(0, 4));
      const roll = i % 6;
      if (roll === 5) return; // no membership yet
      let start;
      let status = 'active';
      let cancelledAt = null;
      if (roll === 4) {
        // expired
        start = dateStr(daysFromToday(-between(120, 200)));
        status = 'expired';
      } else if (roll === 3 && i % 2 === 0) {
        start = dateStr(daysFromToday(-between(5, 20)));
        status = 'cancelled';
        cancelledAt = daysFromToday(-between(1, 4));
      } else {
        start = dateStr(daysFromToday(-between(1, Math.min(25, plan.duration_months * 28))));
        activeMemberIds.add(m.id);
      }
      membershipRows.push({ user_id: m.id, plan_id: plan.id, status, start_date: start, end_date: addMonthsStr(start, plan.duration_months), auto_renew: chance(0.4), cancelled_at: cancelledAt });
      membershipPlans.push(plan);
    });
    const memberships = await insertMany(db, 'memberships', membershipRows, 'id, user_id, start_date');

    const paymentRows = memberships.map((ms, i) => {
      const plan = membershipPlans[i];
      const createdAt = new Date(`${ms.start_date}T10:${String(between(10, 59)).padStart(2, '0')}:00`);
      const brand = pick(['Visa', 'Mastercard']);
      return {
        user_id: ms.user_id, membership_id: ms.id, plan_id: plan.id, amount_cents: plan.price_cents, currency: 'EUR',
        status: 'succeeded', card_brand: brand, card_last4: String(between(1000, 9999)),
        cardholder_name: users.find((u) => u.id === ms.user_id).full_name, reference: ref(),
        description: `Purchase: ${plan.name}`, failure_reason: null, created_at: createdAt,
      };
    });
    // A couple of failed attempts for realism
    for (const m of otherMembers.slice(0, 3)) {
      paymentRows.push({
        user_id: m.id, membership_id: null, plan_id: planByName['Premium Annual'].id, amount_cents: 29900, currency: 'EUR',
        status: 'failed', card_brand: 'Visa', card_last4: '0002', cardholder_name: m.full_name, reference: ref(),
        description: 'Purchase: Premium Annual', failure_reason: 'Card declined by issuer', created_at: at(-between(2, 30), 14),
      });
    }
    const payments = await insertMany(db, 'payments', paymentRows, 'id, user_id, membership_id, amount_cents, status');

    // One cancelled membership gets a full refund
    const cancelledIdx = membershipRows.findIndex((r) => r.status === 'cancelled');
    if (cancelledIdx >= 0) {
      const pay = payments[cancelledIdx];
      await insertMany(db, 'refunds', [{ payment_id: pay.id, amount_cents: pay.amount_cents, reason: 'Moved abroad - cancelled within cooling-off period', issued_by: admin.id, created_at: daysFromToday(-1) }]);
      await db.query(`update gym_v0.payments set status = 'refunded' where id = $1`, [pay.id]);
      await db.query(`update gym_v0.memberships set status = 'refunded' where id = $1`, [memberships[cancelledIdx].id]);
    }

    // ---- Trainer assignments ---------------------------------------------
    const assignmentRows = [{ member_id: mainMember.id, trainer_id: mainTrainer.id, assigned_by: admin.id, notes: 'Wants to build strength for hiking season.', assigned_at: daysFromToday(-18) }];
    otherMembers.forEach((m, i) => {
      if (i % 7 === 6) return; // leave some unassigned
      const trainer = i < 6 ? mainTrainer : trainers[i % trainers.length];
      assignmentRows.push({ member_id: m.id, trainer_id: trainer.id, assigned_by: admin.id, notes: null, assigned_at: daysFromToday(-between(3, 60)) });
    });
    await insertMany(db, 'trainer_assignments', assignmentRows);
    const trainerOf = Object.fromEntries(assignmentRows.map((a) => [a.member_id, a.trainer_id]));

    // ---- Availability + PT sessions --------------------------------------
    const slotRows = [];
    for (const t of trainers) {
      for (let day = -10; day <= 12; day++) {
        const dow = daysFromToday(day).getDay();
        if (dow === 0) continue; // closed Sundays for PT
        for (const hour of t.id === mainTrainer.id ? [7, 10, 17] : [8, 18]) {
          const start = at(day, hour);
          slotRows.push({ trainer_id: t.id, start_at: start, end_at: addMinutes(start, 60), notes: hour < 9 ? 'Early bird' : null });
        }
      }
    }
    const slots = await insertMany(db, 'trainer_availability', slotRows, 'id, trainer_id, start_at, end_at');

    const sessionRows = [];
    const now = new Date();
    const slotsByTrainer = {};
    for (const s of slots) (slotsByTrainer[s.trainer_id] ||= []).push(s);
    for (const [memberId, trainerId] of Object.entries(trainerOf)) {
      const mid = Number(memberId);
      if (!activeMemberIds.has(mid)) continue;
      const open = slotsByTrainer[trainerId].filter((s) => !s.taken);
      const past = open.filter((s) => new Date(s.start_at) < now);
      const future = open.filter((s) => new Date(s.start_at) > now);
      const want = mid === mainMember.id ? { past: 3, future: 2 } : { past: chance(0.6) ? 1 : 0, future: chance(0.5) ? 1 : 0 };
      for (let k = 0; k < want.past && past.length; k++) {
        const s = past.splice(Math.floor(rand() * past.length), 1)[0];
        s.taken = true;
        sessionRows.push({ trainer_id: Number(trainerId), member_id: mid, availability_id: s.id, start_at: s.start_at, end_at: s.end_at, status: chance(0.85) ? 'completed' : 'no_show', member_notes: null });
      }
      for (let k = 0; k < want.future && future.length; k++) {
        const s = future.splice(Math.floor(rand() * Math.min(future.length, 6)), 1)[0];
        s.taken = true;
        sessionRows.push({ trainer_id: Number(trainerId), member_id: mid, availability_id: s.id, start_at: s.start_at, end_at: s.end_at, status: 'booked', member_notes: mid === mainMember.id ? 'Would like to focus on deadlift form.' : null });
      }
    }
    const sessions = await insertMany(db, 'pt_sessions', sessionRows, 'id, trainer_id, member_id, status, start_at');

    // ---- Session notes ----------------------------------------------------
    const noteTexts = [
      ['Lower body focus', 'Squats 4x6 @ RPE 7. Hip hinge improving. Cue: brace before descent. Next time add Romanian deadlifts.'],
      ['Conditioning baseline', 'Completed 2km row test in 8:42. Good pacing. Heart rate recovered well. Increase interval volume next week.'],
      ['Upper body + mobility', 'Bench 3x8, rows 3x10. Shoulder mobility limited on left side - added band work to warm-up.'],
      ['Missed session', 'Client did not attend. Sent a reminder message about the next booking.'],
    ];
    await insertMany(db, 'session_notes', sessions
      .filter((s) => s.status !== 'booked')
      .map((s) => {
        const [title, content] = s.status === 'no_show' ? noteTexts[3] : pick(noteTexts.slice(0, 3));
        return { trainer_id: s.trainer_id, member_id: s.member_id, pt_session_id: s.id, title, content, created_at: addMinutes(new Date(s.start_at), 70) };
      }));

    // ---- Group classes + bookings -----------------------------------------
    const CLASS_TYPES = [
      ['Spin Express', 'High-energy 45-minute indoor cycling session.', 'Studio 2', 45, 18],
      ['HIIT Burn', 'Intervals of strength and cardio to build fitness fast.', 'Studio 1', 45, 20],
      ['Vinyasa Yoga', 'Flowing yoga for strength, balance and flexibility.', 'Studio 3', 60, 16],
      ['Pilates Core', 'Mat-based Pilates focusing on core strength and posture.', 'Studio 3', 50, 14],
      ['Boxfit', 'Pad work and bag drills for a full-body workout.', 'Studio 1', 50, 16],
      ['Strength Circuit', 'Kettlebells, dumbbells and body weight in a guided circuit.', 'Functional Zone', 45, 12],
      ['Zumba', 'Dance fitness party to Latin and world music.', 'Studio 1', 55, 25],
    ];
    const classRows = [];
    for (let day = -7; day <= 14; day++) {
      const times = daysFromToday(day).getDay() === 0 ? [[10, 0], [11, 30]] : [[7, 0], [12, 30], [18, 30], [19, 30]];
      times.forEach(([h, m], idx) => {
        const [title, description, room, mins, capacity] = CLASS_TYPES[(day + 7 + idx * 3) % CLASS_TYPES.length];
        const start = at(day, h, m);
        const trainer = trainers[(day + 7 + idx) % trainers.length];
        classRows.push({
          title, description, room, capacity, trainer_id: trainer.id, start_at: start, end_at: addMinutes(start, mins),
          status: start < now ? 'completed' : (day === 3 && idx === 1 ? 'cancelled' : 'scheduled'),
        });
      });
    }
    const classes = await insertMany(db, 'group_classes', classRows, 'id, start_at, capacity, status, title');

    const bookingRows = [];
    const activeList = members.filter((m) => activeMemberIds.has(m.id));
    for (const c of classes) {
      if (c.status === 'cancelled') continue;
      const isPast = new Date(c.start_at) < now;
      const count = Math.min(c.capacity, between(isPast ? 4 : 1, isPast ? 12 : 8));
      const chosen = new Set();
      while (chosen.size < Math.min(count, activeList.length)) chosen.add(pick(activeList).id);
      for (const memberId of chosen) {
        bookingRows.push({
          class_id: c.id, member_id: memberId,
          status: isPast ? (chance(0.85) ? 'attended' : 'no_show') : (chance(0.1) ? 'cancelled' : 'booked'),
          created_at: addMinutes(new Date(c.start_at), -between(60, 60 * 72)),
        });
      }
    }
    // Make sure the test member has a couple of upcoming bookings
    const upcoming = classes.filter((c) => new Date(c.start_at) > now && c.status === 'scheduled').slice(2, 4);
    for (const c of upcoming) {
      const existing = bookingRows.find((b) => b.class_id === c.id && b.member_id === mainMember.id);
      if (existing) existing.status = 'booked';
      else bookingRows.push({ class_id: c.id, member_id: mainMember.id, status: 'booked', created_at: daysFromToday(-1) });
    }
    await insertMany(db, 'class_bookings', bookingRows);

    // ---- Workout plans ----------------------------------------------------
    const planTemplates = [
      { title: '12-Week Strength Foundation', goal: 'Build base strength', description: 'Three full-body sessions per week with progressive overload.', exercises: 'Day A: Back squat 4x6, Bench press 4x6, Barbell row 3x8, Plank 3x45s\nDay B: Deadlift 3x5, Overhead press 4x6, Lat pulldown 3x10, Farmer carry 3x30m\nDay C: Front squat 3x8, Incline DB press 3x10, Cable row 3x12, Dead bug 3x10' },
      { title: 'Fat Loss Conditioning', goal: 'Reduce body fat while keeping muscle', description: 'Two strength days and two conditioning days.', exercises: 'Mon: Full body strength circuit x4\nWed: 30 min intervals (40s on / 20s off)\nFri: Full body strength circuit x4\nSat: 45 min zone 2 cardio' },
      { title: 'Mobility Reset', goal: 'Improve hip and shoulder mobility', description: 'Daily 20-minute mobility routine.', exercises: '90/90 hip switches 2x10\nCat-cow 2x10\nThoracic rotations 2x8 each side\nBand pull-aparts 3x15\nDeep squat hold 3x30s' },
      { title: '5K Running Plan', goal: 'Run 5K under 30 minutes', description: 'Eight-week running progression.', exercises: 'Tue: Intervals 6x400m\nThu: Tempo run 20 min\nSun: Long easy run 35-50 min' },
    ];
    const wpRows = [
      { ...planTemplates[0], trainer_id: mainTrainer.id, member_id: mainMember.id, start_date: dateStr(daysFromToday(-14)), end_date: dateStr(daysFromToday(70)), is_active: true },
      { ...planTemplates[2], trainer_id: mainTrainer.id, member_id: mainMember.id, start_date: dateStr(daysFromToday(-14)), end_date: null, is_active: true },
    ];
    for (const [memberId, trainerId] of Object.entries(trainerOf)) {
      if (Number(memberId) === mainMember.id || chance(0.35)) continue;
      wpRows.push({ ...pick(planTemplates), trainer_id: trainerId, member_id: Number(memberId), start_date: dateStr(daysFromToday(-between(1, 40))), end_date: null, is_active: true });
    }
    await insertMany(db, 'workout_plans', wpRows);

    // ---- Progress logs + photos ---------------------------------------------
    const logRows = [];
    let weight = 84.6;
    let fat = 24.0;
    let waist = 92;
    for (let w = 8; w >= 0; w--) {
      logRows.push({ member_id: mainMember.id, log_date: dateStr(daysFromToday(-w * 7)), weight_kg: round1(weight), body_fat_pct: round1(fat), waist_cm: round1(waist), notes: w === 8 ? 'Starting point' : (w === 0 ? 'Feeling stronger!' : null) });
      weight -= 0.3 + rand() * 0.4;
      fat -= 0.2 + rand() * 0.3;
      waist -= 0.3 + rand() * 0.5;
    }
    for (const m of otherMembers.slice(0, 12)) {
      let wt = 60 + rand() * 35;
      for (let k = between(1, 4); k >= 0; k--) {
        logRows.push({ member_id: m.id, log_date: dateStr(daysFromToday(-k * 10)), weight_kg: round1(wt), body_fat_pct: round1(15 + rand() * 15), waist_cm: null, notes: null });
        wt -= rand();
      }
    }
    await insertMany(db, 'progress_logs', logRows);

    const photoRows = [
      { colors: [[230, 90, 40], [40, 40, 60]], caption: 'Week 1 - front', taken_on: dateStr(daysFromToday(-56)) },
      { colors: [[40, 160, 120], [30, 40, 70]], caption: 'Week 8 - front', taken_on: dateStr(daysFromToday(-1)) },
    ].map((p, i) => {
      const file = writeUpload(UPLOAD_SUBDIRS.progressPhotos, '.png', makePng(240, 320, ...p.colors));
      return { member_id: mainMember.id, ...file, original_name: `progress-${i + 1}.png`, mime_type: 'image/png', caption: p.caption, taken_on: p.taken_on };
    });
    await insertMany(db, 'progress_photos', photoRows);

    // ---- Health questionnaires -------------------------------------------
    const hqRows = [{
      member_id: mainMember.id, has_heart_condition: false, has_chest_pain: false, has_dizziness: false,
      has_bone_joint_problem: true, takes_medication: false, medications: null, medical_conditions: null,
      injuries: 'Old left ankle sprain (2021), fully recovered.', is_pregnant: false, smoker: false,
      activity_level: 'moderate', fitness_goals: 'Get stronger, lose 5kg, hike Carrauntoohil.',
      emergency_contact_name: 'Jamie Member', emergency_contact_phone: '+353 87 555 0199', consent: true,
    }];
    for (const m of otherMembers.filter((_, i) => i % 2 === 0)) {
      hqRows.push({
        member_id: m.id, has_heart_condition: chance(0.05), has_chest_pain: false, has_dizziness: chance(0.05),
        has_bone_joint_problem: chance(0.2), takes_medication: chance(0.15), medications: null, medical_conditions: null,
        injuries: chance(0.2) ? 'Lower back stiffness' : null, is_pregnant: false, smoker: chance(0.1),
        activity_level: pick(['sedentary', 'light', 'moderate', 'active', 'very_active']),
        fitness_goals: pick(['Lose weight', 'Build muscle', 'Improve fitness', 'Train for a marathon', 'Stay healthy']),
        emergency_contact_name: `${pick(FIRST)} ${pick(LAST)}`, emergency_contact_phone: `+353 86 ${between(100, 999)} ${between(1000, 9999)}`, consent: true,
      });
    }
    await insertMany(db, 'health_questionnaires', hqRows);

    // ---- Messages -----------------------------------------------------------
    const convo = [
      [mainTrainer.id, mainMember.id, 'Welcome aboard! I have put a strength plan in your Workouts tab. Have a look before our first session.', -17],
      [mainMember.id, mainTrainer.id, 'Thanks! Looks great. Should I do the mobility routine on rest days too?', -17],
      [mainTrainer.id, mainMember.id, 'Yes - 15-20 minutes on rest days is perfect.', -16],
      [mainMember.id, mainTrainer.id, 'My left ankle felt a bit tight after squats yesterday.', -3],
      [mainTrainer.id, mainMember.id, 'Noted - we will add some ankle mobility work to the warm-up next session.', -2],
    ];
    const msgRows = convo.map(([from, to, body, day], i) => ({
      sender_id: from, recipient_id: to, body, created_at: at(day, 9 + i), read_at: i < convo.length - 1 ? at(day, 10 + i) : null,
    }));
    for (const [memberId, trainerId] of Object.entries(trainerOf).slice(1, 6)) {
      msgRows.push({ sender_id: Number(memberId), recipient_id: trainerId, body: 'Hi, can we move our next session to later in the day?', created_at: at(-between(1, 5), 12), read_at: null });
    }
    await insertMany(db, 'messages', msgRows);

    // ---- Certifications ---------------------------------------------------
    const certRows = [];
    const certDefs = [
      ['Level 3 Personal Trainer', 'Register of Exercise Professionals', 'approved'],
      ['First Aid & CPR', 'Red Cross Ireland', 'approved'],
      ['Kettlebell Instructor Level 1', 'StrongFirst', 'pending'],
    ];
    for (const t of trainers) {
      const defs = t.id === mainTrainer.id ? certDefs : [certDefs[0], certDefs[1]];
      for (const [title, issuer, status] of defs) {
        const issued = daysFromToday(-between(60, 900));
        const file = writeUpload(UPLOAD_SUBDIRS.certifications, '.pdf', makePdf([title, `Awarded to ${t.full_name}`, `Issued by ${issuer}`, `Date: ${dateStr(issued)}`, 'SYNTHETIC DOCUMENT - FOR TESTING ONLY']));
        certRows.push({
          trainer_id: t.id, title, issuer, issued_on: dateStr(issued), expires_on: dateStr(new Date(issued.getTime() + 2 * 365 * 86400000)),
          ...file, original_name: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`, mime_type: 'application/pdf',
          status, reviewed_by: status === 'approved' ? admin.id : null, reviewed_at: status === 'approved' ? daysFromToday(-30) : null,
          review_notes: status === 'approved' ? 'Verified with issuer' : null,
        });
      }
    }
    await insertMany(db, 'certifications', certRows);

    // ---- Check-ins ----------------------------------------------------------
    const ciRows = [];
    for (let day = -14; day <= 0; day++) {
      const visitors = activeList.filter(() => chance(0.35));
      for (const m of visitors) {
        const t = at(day, between(6, 20), between(0, 59));
        if (t > now) continue;
        ciRows.push({ member_id: m.id, checked_in_by: chance(0.7) ? desk.id : byEmail['sam.desk@crunchgym.test'].id, checked_in_at: t, membership_active: true, notes: null });
      }
    }
    await insertMany(db, 'check_ins', ciRows);

    // ---- Audit log ----------------------------------------------------------
    await insertMany(db, 'audit_logs', [
      { actor_id: null, actor_email: 'seed-script', actor_role: null, action: 'seed.run', entity_type: 'database', entity_id: 'gym_v0', details: JSON.stringify({ users: users.length, classes: classes.length }), ip_address: null },
      { actor_id: admin.id, actor_email: admin.email, actor_role: 'admin', action: 'certification.approved', entity_type: 'certification', entity_id: '1', details: JSON.stringify({ review_notes: 'Verified with issuer' }), ip_address: '127.0.0.1' },
    ]);

    console.log(`  users: ${users.length} (${members.length} members, ${trainers.length} trainers)`);
    console.log(`  plans: ${plans.length}, memberships: ${memberships.length}, payments: ${payments.length}`);
    console.log(`  classes: ${classes.length}, class bookings: ${bookingRows.length}`);
    console.log(`  availability slots: ${slots.length}, PT sessions: ${sessions.length}`);
    console.log(`  check-ins: ${ciRows.length}, certifications: ${certRows.length}`);
  });

  console.log('\nTest accounts (one per role):');
  for (const a of TEST_ACCOUNTS) console.log(`  ${a.role.padEnd(11)} ${a.email.padEnd(28)} ${a.password}`);
  console.log(`  (other synthetic users use the password ${SYNTHETIC_PASSWORD})`);
  console.log('  visitor     no account needed - browse the site logged out');
}

try {
  await main();
  console.log('\nSeed complete.');
} catch (err) {
  console.error('\nSeed failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
