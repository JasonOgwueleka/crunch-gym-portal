-- =====================================================================
-- SEC-12: Tamper-evident audit log (hash chain + append-only).
--
--  1. actor_id no longer has a foreign key to users, so deleting a user never
--     modifies old audit rows (actor_id and actor_email are kept as written).
--  2. Every row stores chain_seq, prev_hash and entry_hash, where
--        entry_hash = SHA-256( prev_hash, chain_seq, id, created_at, actor_id,
--                              actor_email, actor_role, action, entity_type,
--                              entity_id, details, ip_address )
--     The first row links to a hash of 64 zeros ("genesis").
--  3. A BEFORE INSERT trigger computes the hash. It takes a transaction-level
--     advisory lock first, so concurrent inserts are chained one at a time and
--     can never both link to the same previous entry.
--  4. BEFORE UPDATE / BEFORE DELETE triggers reject any change to a row.
--
-- Safe to re-run (the migration runner re-applies every file).
-- =====================================================================

-- 1. Remove every foreign key on audit_logs (in v0 actor_id was
--    "references users on delete set null", which UPDATEs audit rows).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'gym_v1.audit_logs'::regclass and contype = 'f'
  loop
    execute format('alter table gym_v1.audit_logs drop constraint %I', c.conname);
  end loop;
end $$;

-- 2. Hash-chain columns
alter table gym_v1.audit_logs add column if not exists chain_seq  bigint;
alter table gym_v1.audit_logs add column if not exists prev_hash  text;
alter table gym_v1.audit_logs add column if not exists entry_hash text;

-- The exact text that is hashed. Fields are separated by the ASCII unit
-- separator (0x1F); NULL is written as \N. created_at is fixed to UTC with
-- microseconds so the text never depends on the session's time zone.
-- server/src/utils/auditChain.js rebuilds this same string in Node.js to verify.
create or replace function gym_v1.audit_log_canonical(
  p_prev_hash text, p_chain_seq bigint, p_id bigint, p_created_at timestamptz,
  p_actor_id integer, p_actor_email text, p_actor_role text, p_action text,
  p_entity_type text, p_entity_id text, p_details jsonb, p_ip_address text
) returns text
language sql immutable as $$
  select concat_ws(chr(31),
    p_prev_hash,
    p_chain_seq::text,
    p_id::text,
    to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(p_actor_id::text, '\N'),
    coalesce(p_actor_email, '\N'),
    coalesce(p_actor_role, '\N'),
    coalesce(p_action, '\N'),
    coalesce(p_entity_type, '\N'),
    coalesce(p_entity_id, '\N'),
    coalesce(p_details::text, '\N'),
    coalesce(p_ip_address, '\N'))
$$;

create or replace function gym_v1.audit_log_hash(
  p_prev_hash text, p_chain_seq bigint, p_id bigint, p_created_at timestamptz,
  p_actor_id integer, p_actor_email text, p_actor_role text, p_action text,
  p_entity_type text, p_entity_id text, p_details jsonb, p_ip_address text
) returns text
language sql immutable as $$
  select encode(sha256(convert_to(gym_v1.audit_log_canonical(
    p_prev_hash, p_chain_seq, p_id, p_created_at, p_actor_id, p_actor_email,
    p_actor_role, p_action, p_entity_type, p_entity_id, p_details, p_ip_address), 'UTF8')), 'hex')
$$;

-- 3a. Chain any rows that existed before this migration, oldest first.
--     (Runs before the append-only triggers exist; on re-runs nothing matches.)
do $$
declare
  r record;
  v_prev text;
  v_seq bigint;
begin
  select entry_hash, chain_seq into v_prev, v_seq
    from gym_v1.audit_logs where entry_hash is not null
   order by chain_seq desc limit 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_seq := coalesce(v_seq, 0);
  for r in select * from gym_v1.audit_logs where entry_hash is null order by created_at, id loop
    v_seq := v_seq + 1;
    update gym_v1.audit_logs
       set chain_seq = v_seq,
           prev_hash = v_prev,
           entry_hash = gym_v1.audit_log_hash(v_prev, v_seq, r.id, r.created_at, r.actor_id,
                          r.actor_email, r.actor_role, r.action, r.entity_type, r.entity_id,
                          r.details, r.ip_address)
     where id = r.id
     returning entry_hash into v_prev;
  end loop;
end $$;

alter table gym_v1.audit_logs alter column chain_seq  set not null;
alter table gym_v1.audit_logs alter column prev_hash  set not null;
alter table gym_v1.audit_logs alter column entry_hash set not null;
create unique index if not exists audit_logs_chain_seq_idx on gym_v1.audit_logs (chain_seq);

-- 3b. Compute the hash for every new row (app, seed script or manual SQL).
create or replace function gym_v1.audit_logs_chain_insert() returns trigger
language plpgsql as $$
declare
  v_prev text;
  v_seq bigint;
begin
  -- One writer at a time: held until this transaction commits, so the next
  -- insert always sees this row as the latest one.
  perform pg_advisory_xact_lock(hashtext('gym_v1.audit_logs.chain'));

  select entry_hash, chain_seq into v_prev, v_seq
    from gym_v1.audit_logs order by chain_seq desc limit 1;

  new.chain_seq  := coalesce(v_seq, 0) + 1;
  new.prev_hash  := coalesce(v_prev, repeat('0', 64));
  new.created_at := coalesce(new.created_at, now());
  new.entry_hash := gym_v1.audit_log_hash(new.prev_hash, new.chain_seq, new.id, new.created_at,
                      new.actor_id, new.actor_email, new.actor_role, new.action, new.entity_type,
                      new.entity_id, new.details, new.ip_address);
  return new;
end $$;

drop trigger if exists audit_logs_chain_insert on gym_v1.audit_logs;
create trigger audit_logs_chain_insert
  before insert on gym_v1.audit_logs
  for each row execute function gym_v1.audit_logs_chain_insert();

-- 4. Append-only: no UPDATE or DELETE of audit rows.
create or replace function gym_v1.audit_logs_block_change() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only: % is not allowed (row id %)', tg_op, old.id
    using errcode = 'insufficient_privilege';
end $$;

drop trigger if exists audit_logs_no_update on gym_v1.audit_logs;
create trigger audit_logs_no_update
  before update on gym_v1.audit_logs
  for each row execute function gym_v1.audit_logs_block_change();

drop trigger if exists audit_logs_no_delete on gym_v1.audit_logs;
create trigger audit_logs_no_delete
  before delete on gym_v1.audit_logs
  for each row execute function gym_v1.audit_logs_block_change();

comment on table gym_v1.audit_logs is
  'SEC-12: append-only, hash-chained audit log. Verify with GET /api/admin/audit-logs/verify.';
