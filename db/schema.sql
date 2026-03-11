-- QuestClass v2 schema (Supabase/Postgres-ready)

create table if not exists profiles (
  id uuid primary key,
  email text unique not null,
  full_name text,
  role text not null check (role in ('teacher','student','parent','admin')),
  created_at timestamptz default now()
);

create table if not exists classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  name text not null,
  grade text,
  subject text default 'Mathematics',
  created_at timestamptz default now()
);

create table if not exists classroom_members (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  profile_id uuid not null,
  role text not null check (role in ('teacher','student','assistant')),
  created_at timestamptz default now()
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid,
  title text not null,
  description text,
  difficulty text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid,
  type text,
  prompt text not null,
  answer text,
  explanation text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid,
  unit_id uuid,
  title text not null,
  status text default 'draft' check (status in ('draft','assigned','closed')),
  created_at timestamptz default now()
);

create table if not exists assignment_questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  question_id uuid not null,
  sort_order integer default 0
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  student_id uuid not null,
  answers jsonb default '[]'::jsonb,
  score numeric,
  feedback text,
  submitted_at timestamptz default now()
);

create table if not exists skill_snapshots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  classroom_id uuid,
  skill_name text not null,
  score integer not null,
  captured_at timestamptz default now()
);

create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  classroom_id uuid,
  kind text not null check (kind in ('chat','lesson_loop','grading','question_generation')),
  input jsonb default '{}'::jsonb,
  output jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
