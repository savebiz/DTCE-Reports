-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Events Table
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  theme_colors jsonb default '{"primary": "#1B3A6B", "secondary": "#C49A00"}'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Event Days Table
create table if not exists public.event_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  day_number integer not null,
  date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_event_day_number unique (event_id, day_number),
  constraint unique_event_date unique (event_id, date)
);

-- 3. Departments Table
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_metrics_schema jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Profiles Table (linked to Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null check (role in ('super_admin', 'coordinator', 'hod', 'assistant')),
  username text unique,
  must_change_password boolean default true not null,
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. HOD Assignments Table
create table if not exists public.hod_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  role_in_event text not null check (role_in_event in ('hod', 'assistant')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_event_profile_dept unique (event_id, profile_id, department_id)
);

-- 6. Daily Reports Table
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  event_day_id uuid references public.event_days(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  submitted_by uuid references public.profiles(id) not null,
  submitted_on_behalf_by uuid references public.profiles(id) on delete set null,
  attendance_morning integer default 0 not null,
  attendance_evening integer default 0 not null,
  metrics_data jsonb default '{}'::jsonb not null,
  status text default 'draft'::text not null check (status in ('draft', 'submitted', 'reviewed', 'approved')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_day_department unique (event_day_id, department_id)
);

-- 7. Department Narratives Table
create table if not exists public.department_narratives (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid references public.daily_reports(id) on delete cascade unique, -- optional for end-of-event reports
  event_id uuid references public.events(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  is_end_of_event boolean default false not null,
  status text default 'draft'::text not null check (status in ('draft', 'submitted', 'reviewed', 'approved')),
  overview text,
  highlights text,
  challenges_json jsonb default '[]'::jsonb not null,
  recommendations_json jsonb default '[]'::jsonb not null,
  key_achievements text, -- for daily reports backward compatibility
  challenges text, -- for daily reports backward compatibility
  solutions text, -- for daily reports backward compatibility
  plans_for_tomorrow text, -- for daily reports backward compatibility
  feedback text, -- for daily reports backward compatibility
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Report Versions Table (History)
create table if not exists public.report_versions (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid references public.daily_reports(id) on delete cascade not null,
  version_number integer not null,
  changed_by uuid references public.profiles(id) not null,
  change_summary text,
  data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_report_version unique (daily_report_id, version_number)
);

-- Automatic Profile Creation Trigger on Auth Sign-Up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, username, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'assistant'),
    coalesce(new.raw_user_meta_data->>'username', substring(new.email from '^[^@]+')),
    coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, true)
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger execution
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Automatic updated_at trigger for Daily Reports
create or replace function public.handle_update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_daily_report_updated on public.daily_reports;
create trigger on_daily_report_updated
  before update on public.daily_reports
  for each row execute procedure public.handle_update_timestamp();

-- RLS (Row Level Security) Configuration
alter table public.events enable row level security;
alter table public.event_days enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.hod_assignments enable row level security;
alter table public.daily_reports enable row level security;
alter table public.department_narratives enable row level security;
alter table public.report_versions enable row level security;

-- Public read access policies for events, event_days, departments
drop policy if exists "Allow public read access to events" on public.events;
create policy "Allow public read access to events" on public.events for select using (true);

drop policy if exists "Allow public read access to event_days" on public.event_days;
create policy "Allow public read access to event_days" on public.event_days for select using (true);

drop policy if exists "Allow public read access to departments" on public.departments;
create policy "Allow public read access to departments" on public.departments for select using (true);

-- Profiles policies
drop policy if exists "Allow users to read all profiles" on public.profiles;
create policy "Allow users to read all profiles" on public.profiles for select using (true);

drop policy if exists "Allow users to update their own profile" on public.profiles;
create policy "Allow users to update their own profile" on public.profiles for update using (auth.uid() = id);

-- Assignments policies
drop policy if exists "Allow public read access to assignments" on public.hod_assignments;
create policy "Allow public read access to assignments" on public.hod_assignments for select using (true);

drop policy if exists "Allow admins to manage assignments" on public.hod_assignments;
create policy "Allow admins to manage assignments" on public.hod_assignments for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator'))
);

-- Daily Reports policies
drop policy if exists "Allow admins/coordinators to view all reports" on public.daily_reports;
drop policy if exists "Allow HODs/assistants to view their assigned department reports" on public.daily_reports;
drop policy if exists "Allow assigned HODs/assistants to insert reports" on public.daily_reports;
drop policy if exists "Allow assigned HODs/assistants/admins to insert reports" on public.daily_reports;
drop policy if exists "Allow assigned HODs/assistants to update their draft reports" on public.daily_reports;
drop policy if exists "Allow assigned HODs/assistants/admins to update reports" on public.daily_reports;
drop policy if exists "Allow select daily_reports" on public.daily_reports;
drop policy if exists "Allow insert daily_reports" on public.daily_reports;
drop policy if exists "Allow update daily_reports" on public.daily_reports;

create policy "Allow select daily_reports" on public.daily_reports 
for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator'))
  or submitted_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = daily_reports.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = daily_reports.department_id)
);

create policy "Allow insert daily_reports" on public.daily_reports 
for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator', 'hod', 'assistant'))
  or submitted_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = daily_reports.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = daily_reports.department_id)
);

create policy "Allow update daily_reports" on public.daily_reports 
for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator', 'hod', 'assistant'))
  or submitted_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = daily_reports.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = daily_reports.department_id)
);

-- Department Narratives policies
drop policy if exists "Allow read access based on report access" on public.department_narratives;
drop policy if exists "Allow narrative modification based on report write access" on public.department_narratives;
drop policy if exists "Allow narrative modification based on department access" on public.department_narratives;
drop policy if exists "Allow select department_narratives" on public.department_narratives;
drop policy if exists "Allow all department_narratives" on public.department_narratives;

create policy "Allow select department_narratives" on public.department_narratives 
for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator'))
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = department_narratives.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = department_narratives.department_id)
  or exists (select 1 from public.daily_reports where id = department_narratives.daily_report_id and submitted_by = auth.uid())
);

create policy "Allow all department_narratives" on public.department_narratives 
for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'coordinator', 'hod', 'assistant'))
  or exists (select 1 from public.profiles where id = auth.uid() and department_id = department_narratives.department_id)
  or exists (select 1 from public.hod_assignments where profile_id = auth.uid() and department_id = department_narratives.department_id)
  or exists (select 1 from public.daily_reports where id = department_narratives.daily_report_id and submitted_by = auth.uid())
);
    )
  )
);

-- Report Versions policies
drop policy if exists "Allow view access to report versions based on report access" on public.report_versions;
create policy "Allow view access to report versions based on report access" on public.report_versions for select using (
  exists (select 1 from public.daily_reports where id = daily_report_id)
);

drop policy if exists "Allow insert version based on report write access" on public.report_versions;
create policy "Allow insert version based on report write access" on public.report_versions for insert with check (
  exists (
    select 1 from public.daily_reports
    where id = daily_report_id and (
      submitted_by = auth.uid() or
      exists (
        select 1 from public.hod_assignments
        where profile_id = auth.uid() and department_id = daily_reports.department_id and event_id = daily_reports.event_id
      )
    )
  )
);

-- Seed departments data
insert into public.departments (name) values
  ('Accommodation'),
  ('Counselling'),
  ('Drama'),
  ('General Welfare'),
  ('Education & Resource Development'),
  ('Electrical'),
  ('Entrepreneurship & Skills Acquisition'),
  ('Evangelism'),
  ('ICT'),
  ('Medical'),
  ('Music'),
  ('Prayer'),
  ('Press'),
  ('Programs (Teens)'),
  ('Programs (Pre-Teens)'),
  ('Programs (6-8 years)'),
  ('Programs (Toddler)'),
  ('Protocol'),
  ('Projects & Maintenance'),
  ('Publicity'),
  ('Registration'),
  ('Research & Development'),
  ('SEPU'),
  ('Sanitation'),
  ('Secretariat'),
  ('Security'),
  ('Special Children'),
  ('Sports'),
  ('Stores'),
  ('Technical'),
  ('Toddlers'),
  ('Transportation'),
  ('Ushering'),
  ('Welfare (Kitchen/Serving)'),
  ('Public Relations'),
  ('Human & Capacity Development'),
  ('Finance'),
  ('Decoration & Event Planning'),
  ('Media'),
  ('DTCE Ambassadors'),
  ('National Competitions Committee')
on conflict (name) do nothing;

-- Update pilot departments with schemas
update public.departments
set default_metrics_schema = '{
  "fields": [
    {
      "name": "registration_data",
      "label": "Registration Data (by Mode)",
      "type": "repeat-group",
      "schema": [
        { "name": "mode", "label": "Mode", "type": "select", "options": ["online", "offline"] },
        { "name": "teachers", "label": "Teachers Registered", "type": "number" },
        { "name": "teens", "label": "Teens Registered", "type": "number" },
        { "name": "pre_teens", "label": "Pre-Teens Registered", "type": "number" },
        { "name": "children", "label": "Children Registered", "type": "number" },
        { "name": "amount_collected", "label": "Amount Collected (₦)", "type": "number" }
      ]
    }
  ]
}'::jsonb
where name = 'Registration';

update public.departments
set default_metrics_schema = '{
  "fields": [
    {
      "name": "services",
      "label": "Services",
      "type": "repeat-group",
      "schema": [
        { "name": "event_title", "label": "Service / Event Title", "type": "text" },
        { "name": "preacher", "label": "Preacher", "type": "text" },
        { "name": "male", "label": "Male Attendance", "type": "number" },
        { "name": "female", "label": "Female Attendance", "type": "number" },
        { "name": "offering", "label": "Offering Collected (₦)", "type": "number" },
        {
          "name": "attendance_by_category",
          "label": "Attendance by Category",
          "type": "repeat-group",
          "schema": [
            { "name": "category", "label": "Category", "type": "select", "options": ["Toddlers", "5-9", "8-12", "Teenagers", "Teaching Teachers", "Other Depts"] },
            { "name": "male", "label": "Male", "type": "number" },
            { "name": "female", "label": "Female", "type": "number" }
          ]
        }
      ]
    }
  ]
}'::jsonb
where name = 'Ushering';

update public.departments
set default_metrics_schema = '{
  "fields": [
    {
      "name": "meals",
      "label": "Meals Served",
      "type": "repeat-group",
      "schema": [
        { "name": "meal_type", "label": "Meal Type", "type": "select", "options": ["breakfast", "lunch", "dinner"] },
        { "name": "item", "label": "Food Item", "type": "text" },
        { "name": "quantity", "label": "Quantity", "type": "number" },
        { "name": "unit", "label": "Unit (e.g. Plates, Packs, Bags)", "type": "text" }
      ]
    }
  ]
}'::jsonb
where name = 'Welfare (Kitchen/Serving)';

update public.departments
set default_metrics_schema = '{
  "fields": [
    {
      "name": "patients_demographics",
      "label": "Patient Demographics",
      "type": "repeat-group",
      "schema": [
        { "name": "category", "label": "Category", "type": "select", "options": ["children", "adult"] },
        { "name": "gender", "label": "Gender", "type": "select", "options": ["male", "female"] },
        { "name": "count", "label": "Count", "type": "number" }
      ]
    },
    {
      "name": "diagnoses",
      "label": "Diagnoses & Cases",
      "type": "repeat-group",
      "schema": [
        { "name": "diagnosis", "label": "Diagnosis / Symptom", "type": "text" },
        { "name": "count", "label": "Count", "type": "number" }
      ]
    }
  ]
}'::jsonb
where name = 'Medical';
