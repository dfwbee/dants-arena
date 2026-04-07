alter table public.users
add column if not exists city text default '',
add column if not exists notification_preferences jsonb not null default '{
  "bookingConfirmations": true,
  "eventReminders": true,
  "membershipRenewal": true,
  "promotionalMessages": false
}'::jsonb;

update public.users
set city = coalesce(city, '')
where city is null;

update public.users
set notification_preferences = coalesce(
  notification_preferences,
  '{
    "bookingConfirmations": true,
    "eventReminders": true,
    "membershipRenewal": true,
    "promotionalMessages": false
  }'::jsonb
);
