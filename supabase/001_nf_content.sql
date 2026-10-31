-- Run once in Supabase SQL Editor. Private member content is never stored in public static files.
create table if not exists public.nf_content (
 id uuid primary key default gen_random_uuid(),
 section text not null check (section in ('academy','kitchen','journal','calm','studio','reset','seasons')),
 title text not null check (char_length(title) between 1 and 160),
 summary text not null default '' check (char_length(summary)<=1000),
 body text not null default '' check (char_length(body)<=50000),
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.nf_content enable row level security;
revoke all on public.nf_content from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on public.nf_content to service_role;
create or replace function public.nf_content_touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists nf_content_touch on public.nf_content;
create trigger nf_content_touch before update on public.nf_content for each row execute function public.nf_content_touch_updated_at();
create index if not exists nf_content_section_published_idx on public.nf_content(section,published,created_at desc);
