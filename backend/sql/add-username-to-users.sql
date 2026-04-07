alter table public.users
add column if not exists username text;

update public.users
set username = lower(split_part(email, '@', 1))
where (username is null or username = '')
  and email is not null;

alter table public.users
alter column username set not null;

create unique index if not exists users_username_key
on public.users (username);
