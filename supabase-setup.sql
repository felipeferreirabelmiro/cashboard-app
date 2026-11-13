create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  due_date date,
  notes text not null default '',
  kind text not null default 'variable',
  flow text not null default 'expense',
  installments integer not null default 1 check (installments >= 1),
  type text not null default 'cash',
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses(user_id, date);
alter table public.expenses enable row level security;
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

drop policy if exists "Read own expenses" on public.expenses;
create policy "Read own expenses" on public.expenses
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Create own expenses" on public.expenses;
create policy "Create own expenses" on public.expenses
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own expenses" on public.expenses;
create policy "Update own expenses" on public.expenses
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own expenses" on public.expenses;
create policy "Delete own expenses" on public.expenses
  for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  budget numeric(12,2) not null default 0 check (budget >= 0),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Create own profile" on public.profiles;
create policy "Create own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own profile" on public.profiles;
create policy "Delete own profile" on public.profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

