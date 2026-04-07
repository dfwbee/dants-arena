alter table public.users
add column if not exists email_verified boolean not null default false,
add column if not exists email_verification_token text,
add column if not exists email_verification_expires_at timestamptz,
add column if not exists email_verification_sent_at timestamptz;

update public.users
set email_verified = true
where email_verified is distinct from true;

create unique index if not exists users_email_verification_token_key
on public.users (email_verification_token)
where email_verification_token is not null;
