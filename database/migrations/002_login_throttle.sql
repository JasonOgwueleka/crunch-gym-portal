-- =====================================================================
-- SEC-01: Brute-force protection – persistent login lockout state.
--
-- One row per login identifier (the normalised email that was typed in),
-- whether or not a user with that email exists. Tracking unknown emails the
-- same way as real ones means the lockout behaviour cannot be used to find
-- out which emails are registered.
--
-- Safe to re-run.
-- =====================================================================

create table if not exists gym_v1.login_throttle (
  email_key          text        primary key,            -- lower(trim(email))
  failed_count       integer     not null default 0,
  window_started_at  timestamptz not null default now(),  -- start of the current 15-minute counting window
  locked_until       timestamptz,                         -- null = not locked
  updated_at         timestamptz not null default now()
);

create index if not exists login_throttle_updated_idx on gym_v1.login_throttle (updated_at);

comment on table gym_v1.login_throttle is
  'SEC-01: failed-login counters and lockouts per normalised email (also for emails with no account).';
