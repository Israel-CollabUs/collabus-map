
-- Enable extensions
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- Partners table
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text[] not null default '{}',
  address text not null,
  lat double precision not null,
  lng double precision not null,
  phone text,
  website text,
  instagram text,
  collab jsonb not null default '{}',     -- {partnerIds:[], popRule, code, status}
  media jsonb not null default '{}',
  accessibility jsonb not null default '{}',
  hours jsonb,
  is_public boolean not null default true,
  lastVerifiedAt timestamptz default now(),
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security
alter table public.partners enable row level security;

-- Policies
create policy "Public read only public partners"
on public.partners
for select
to anon
using ( is_public = true );

create policy "Auth read all partners"
on public.partners
for select
to authenticated
using ( true );

create policy "Auth can insert"
on public.partners
for insert
to authenticated
with check ( true );

create policy "Auth can update"
on public.partners
for update
to authenticated
using ( true )
with check ( true );

-- Timestamp trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_timestamp on public.partners;
create trigger set_timestamp
before update on public.partners
for each row execute procedure public.set_updated_at();
