-- =====================================================================
-- DANGER: drops the entire gym_v1 schema and every row in it.
-- Use only to start over in development, then re-run migrations/001.
-- Does not touch the public schema or any other schema.
-- =====================================================================
drop schema if exists gym_v1 cascade;
