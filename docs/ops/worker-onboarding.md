# Worker Onboarding — Operational Workflow

Status: Active gap, documented behavior. Not yet a self-service flow.

## The Constraint

The `public.handle_new_user()` trigger on `auth.users` insert hardcodes the
role for every new user:

```sql
begin
  insert into public.profiles (id, role, phone)
  values (new.id, 'customer', new.phone);
  return new;
end;
```

Every Supabase auth signup (phone OTP) creates a `profiles` row with
`role = 'customer'`. There is no signup flag, no metadata pathway, and no
client-driven way to elect the worker role.

When a worker calls `POST /api/workers/register`, the route helper
`registerWorker()` reads `profiles.role` and rejects with `WRONG_ROLE / 403`
if it is not `'worker'`. The submission fails until role is changed.

## Phase 1 Manual Workflow

Until a self-service flow exists, admin onboards workers out of band:

1. Prospective worker contacts the platform through whatever channel
   operations uses (Zalo, phone, in-person).
2. Worker signs up in the app via phone OTP. `profiles.role` is set to
   `'customer'` by the trigger.
3. Admin verifies identity manually (per `STRUCTURES.md` §B1 — admin must
   approve worker trust before marketplace access anyway, so this step
   does not add new work).
4. Admin updates the row via Supabase Studio or service-role API:

   ```sql
   update public.profiles set role = 'worker' where id = '<auth_user_id>';
   ```

5. Worker re-opens the app and calls `POST /api/workers/register` with the
   verification submission. Role check now passes.
6. Admin approves the submission (`worker_profiles.verification_status =
   'approved'`, `is_approved = true`) per the existing B1 flow.

This is two manual touches per worker (role flip + verification approve).
For pre-revenue scale (< 20 workers), this is acceptable per `CLAUDE.md`
Core Principle #2 (Bitter Lesson — simple > complex, ship first).

## When to Build a Self-Service Path

Build when at least one is true:

- Worker onboarding volume exceeds ~5 / week
- Admin reports the manual flip as a recurring friction point
- A signup screen for workers ships in the mobile app

## Future Designs (do not implement now)

Three plausible patterns, in increasing complexity:

1. **`signup_type` metadata + smarter trigger.** Mobile passes
   `signup_type: 'worker'` in `user_metadata` during `signUp()`. Trigger
   reads `new.raw_user_meta_data->>'signup_type'` and sets role
   accordingly. **Risk:** any client controls the metadata, so role
   becomes client-controlled — violates `RULES.md` security spirit. Need
   server-side verification before flip.

2. **Two-step API.** `POST /api/workers/signup-intent` records the intent
   server-side (separate table), admin approves intent, only then role
   flips. Cleaner trust model but adds a new state and admin queue.

3. **Separate auth realm.** Workers sign in through a different Supabase
   project or auth flow. Highest isolation but doubles infra.

Recommendation when the time comes: option 2.

## Code References

- Trigger: `supabase/migrations/20260511000000_init_schema.sql`
  (search `handle_new_user`)
- Register route: `apps/api/src/app/api/workers/register/route.ts`
- Register module: `apps/api/src/lib/workers/register.ts` (line 38-43 is
  the `WRONG_ROLE` guard)
