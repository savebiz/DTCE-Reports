-- Migration: Phase 3 Dynamic Lookup Lists & Stores Requisitions
-- Run this in the Supabase SQL Editor to establish custom settings tables, request tables, RLS policies, and lookup seed values.

-- 1. Create Tribes Lookup Table
create table if not exists public.tribes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Diagnoses Lookup Table
create table if not exists public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Store Requests Table
create table if not exists public.store_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid references public.profiles(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  event_id uuid references public.events(id) on delete cascade not null,
  items_json jsonb not null, -- Array of items: { name, quantity, category }
  status text default 'pending_coordinator'::text check (status in ('pending_coordinator', 'approved', 'declined', 'delivered')),
  assigned_approver_id uuid references public.profiles(id) on delete set null, -- delegated approver
  reviewer_comments text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Enable Row Level Security (RLS)
alter table public.tribes enable row level security;
alter table public.diagnoses enable row level security;
alter table public.store_requests enable row level security;

-- 5. Create RLS Policies for Lookup Tables
drop policy if exists "Allow read access to lookup tables for everyone" on public.tribes;
create policy "Allow read access to lookup tables for everyone" on public.tribes for select using (true);

drop policy if exists "Allow read access to lookup tables for everyone" on public.diagnoses;
create policy "Allow read access to lookup tables for everyone" on public.diagnoses for select using (true);

drop policy if exists "Allow admins to modify tribes" on public.tribes;
create policy "Allow admins to modify tribes" on public.tribes for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator'))
);

drop policy if exists "Allow admins and HODs to modify diagnoses" on public.diagnoses;
create policy "Allow admins and HODs to modify diagnoses" on public.diagnoses for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator', 'hod'))
);

-- 6. Create RLS Policies for Store Requests
drop policy if exists "Allow select access to store requests" on public.store_requests;
create policy "Allow select access to store requests" on public.store_requests for select using (
  requester_profile_id = auth.uid() or
  assigned_approver_id = auth.uid() or
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator')) or
  exists (
    select 1 from public.hod_assignments
    where profile_id = auth.uid() 
      and department_id = '43fe996e-db9b-4e94-8311-99528b8bb690' -- Stores department
  ) or
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'hod' and (
      username = 'stores.hod' or email = 'stores.hod@accounts.dtce-reports.vercel.app'
    )
  )
);

drop policy if exists "Allow HODs/assistants to insert store requests" on public.store_requests;
create policy "Allow HODs/assistants to insert store requests" on public.store_requests for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('hod', 'assistant'))
);

drop policy if exists "Allow modification of store requests" on public.store_requests;
create policy "Allow modification of store requests" on public.store_requests for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator')) or
  assigned_approver_id = auth.uid() or
  (status = 'approved' and exists (
    select 1 from public.hod_assignments
    where profile_id = auth.uid() and department_id = '43fe996e-db9b-4e94-8311-99528b8bb690'
  )) or
  (status = 'approved' and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'hod' and (
      username = 'stores.hod' or email = 'stores.hod@accounts.dtce-reports.vercel.app'
    )
  ))
);

-- 7. Populate Seed Lookup Values
insert into public.tribes (name) values
  ('Reuben'), ('Simeon'), ('Judah'), ('Levi'), ('Issachar'), ('Zebulun'),
  ('Dan'), ('Naphtali'), ('Gad'), ('Asher'), ('Joseph'), ('Benjamin')
on conflict (name) do nothing;

insert into public.diagnoses (name) values
  ('DIARRHOEA/VOMITTING/STOOLING'), ('RTI'), ('FEVER'), ('ABDOMINAL PAINS'),
  ('FAINTING SYNDROME'), ('INJURY/LACERATION'), ('BODY WEAKNESS'), ('BODY PAINS'),
  ('TOOTHACHE'), ('BOIL/SWELLING ON TOE, NECK ETC'), ('CONJUCTIVITIS'), ('ULCER'),
  ('MENSTRUAL PAIN'), ('RASH'), ('ASTHMATIC ATTACK'), ('SWOLLEN GUM'),
  ('CONSTIPATION')
on conflict (name) do nothing;
