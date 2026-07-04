-- Editable Staff Directory for Staff Digital Whiteboard Admin (non-destructive)

create table if not exists public.staff_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  department text not null default 'Front Desk',
  email text,
  phone text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_directory_name_idx on public.staff_directory(lower(name));
create index if not exists staff_directory_department_idx on public.staff_directory(department);
create index if not exists staff_directory_status_idx on public.staff_directory(status);
create index if not exists staff_directory_created_at_idx on public.staff_directory(created_at desc);

drop trigger if exists set_staff_directory_updated_at on public.staff_directory;
create trigger set_staff_directory_updated_at
  before update on public.staff_directory
  for each row execute function public.set_updated_at();

alter table public.staff_directory enable row level security;

drop policy if exists "No public staff directory access" on public.staff_directory;
create policy "No public staff directory access"
  on public.staff_directory for all using (false) with check (false);
