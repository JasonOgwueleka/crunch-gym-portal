# Prompt 0b: Separate database schema for v1

**Owner:** Jason. **Commit:** `v1: switch to gym_v1 schema`

## PROMPT
```text
First task (not a security requirement): make this version use its own
database schema so the v0 version keeps working.

1. Change every reference to the gym_v0 schema to gym_v1 (server code,
   session store schemaName, migrations, seed and reset scripts, README).
   This task overrides rule 3: edit the existing migration so it creates
   gym_v1 instead of gym_v0.
2. database/reset.sql must only drop gym_v1.
3. Tell me the exact commands to create the gym_v1 schema and load the
   seed data.
4. Do not change any app behaviour.
```

## Notes (don't paste)
- **Changed from the original:** the "overrides rule 3" sentence was added, because the original contradicted Prompt 0.
- Expected commands: `npm run db:migrate` then `npm run db:seed`. They create and fill `gym_v1` and don't touch `gym_v0`, so Ben and Alex can keep testing v0.
- Check: in Supabase → Table Editor, the schema dropdown should now show both `gym_v0` and `gym_v1`. Screenshot it.
- This commit also includes the `docs/` folder and the `.gitignore` change.
