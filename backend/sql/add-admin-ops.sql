create table if not exists public.qr_checkins (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  member_user_id uuid not null,
  booking_id text,
  booking_facility text,
  booking_date date,
  booking_time text,
  membership text,
  checked_in_at timestamptz not null default now()
);

alter table public.event_registrations
add column if not exists attended boolean not null default false,
add column if not exists checked_in_at timestamptz;
