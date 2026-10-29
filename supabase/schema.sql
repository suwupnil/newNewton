-- ============================================================================
-- Newton Enhancer - Supabase PostgreSQL Schema (ap-south-1 Mumbai)
-- ============================================================================

-- 1. Create the quizzes table
create table if not exists public.quizzes (
  assessment_hash text primary key,
  course_hash text,
  title text,
  total_questions integer not null default 0,
  has_answers_revealed boolean not null default false,
  questions jsonb not null default '[]'::jsonb,
  archived_by_uid text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Indexes for instant lookups
create index if not exists idx_quizzes_course_hash on public.quizzes (course_hash);
create index if not exists idx_quizzes_has_answers on public.quizzes (has_answers_revealed);

-- 3. Enable Row Level Security (RLS)
alter table public.quizzes enable row level security;

-- Policy 1: Allow public read access (clients can check and read solutions)
create policy "Allow public read access"
  on public.quizzes
  for select
  using (true);

-- 4. Revoke ALL write permissions from client roles (anon and authenticated)
-- No client is allowed to write to the database!
-- Only the Supabase Edge Function (running with service_role) can insert/update.
revoke insert, update, delete on table public.quizzes from anon, authenticated;
