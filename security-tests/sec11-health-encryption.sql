-- =====================================================================
-- SEC-11 manual tests. Run in the Supabase SQL editor, one block at a time.
-- Afterwards run `npm run db:seed` (v1 branch) to restore clean data.
-- =====================================================================

-- T-11b: the sensitive fields are ciphertext in v1, plaintext in v0
select member_id, medications, medical_conditions, injuries,
       emergency_contact_name, emergency_contact_phone
  from gym_v1.health_questionnaires order by member_id limit 5;

select member_id, medications, medical_conditions, injuries,
       emergency_contact_name, emergency_contact_phone
  from gym_v0.health_questionnaires order by member_id limit 5;


-- T-11d: change ONE character of member@crunchgym.test's encrypted medications value.
-- (Replaces the last character with 'A', or 'B' if it already is 'A'.)
update gym_v1.health_questionnaires h
   set medications = left(h.medications, -1) ||
                     case when right(h.medications, 1) = 'A' then 'B' else 'A' end
  from gym_v1.users u
 where u.id = h.member_id and u.email = 'member@crunchgym.test'
returning h.member_id, h.medications;

-- Then log in as member@crunchgym.test -> Health questionnaire.
-- Expected: an error "failed an integrity check", NOT garbled text.
-- Admin -> Audit log shows security.health_data_integrity_failure.
