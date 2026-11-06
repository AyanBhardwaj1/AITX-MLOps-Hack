-- Who made a decision, by the email they were signed in with at the time (kept even if they later
-- leave the team). The actor column already holds their user id.
alter table public.entity_events add column actor_email text check (actor_email is null or length(actor_email) between 3 and 254);
