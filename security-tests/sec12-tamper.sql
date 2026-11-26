-- =====================================================================
-- SEC-12 manual tests. Run in the Supabase SQL editor, one block at a time.
-- Uses the v1 schema (gym_v1). Afterwards run `npm run db:seed` (on the v1
-- branch) to get a clean, untampered chain back.
-- =====================================================================

-- Look at the chain (latest 10 entries)
select id, chain_seq, action, left(prev_hash, 12) as prev, left(entry_hash, 12) as hash, created_at
  from gym_v1.audit_logs order by chain_seq desc limit 10;


-- ---------------------------------------------------------------------
-- T-12b: try to change or delete an audit row -> both must FAIL with
--        "audit_logs is append-only: ... is not allowed"
-- ---------------------------------------------------------------------
update gym_v1.audit_logs set action = 'hacked' where chain_seq = 2;

delete from gym_v1.audit_logs where chain_seq = 2;


-- ---------------------------------------------------------------------
-- T-12c: tamper on purpose (as a DB admin would), then run verify.
-- Step 1: switch the protection off, edit ONE row, switch it back on.
--         Note the id it prints; verify should report that id.
-- ---------------------------------------------------------------------
alter table gym_v1.audit_logs disable trigger audit_logs_no_update;

update gym_v1.audit_logs
   set details = jsonb_build_object('tampered', true)
 where chain_seq = 3
returning id, chain_seq, action;

alter table gym_v1.audit_logs enable trigger audit_logs_no_update;

-- Step 2: in the app, log in as admin -> Audit log -> "Re-check"
--         (or GET /api/admin/audit-logs/verify). Expected:
--         "Tampering detected at entry ID <id above> ... Content changed"


-- Optional T-12c variant: delete a row with the trigger off -> verify reports
-- a "Sequence gap" at the entry after the deleted one.
-- alter table gym_v1.audit_logs disable trigger audit_logs_no_delete;
-- delete from gym_v1.audit_logs where chain_seq = 4;
-- alter table gym_v1.audit_logs enable trigger audit_logs_no_delete;
