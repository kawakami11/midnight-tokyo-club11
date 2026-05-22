create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  address text not null default '',
  timezone text not null default 'Asia/Tokyo',
  cancellation_hours integer not null default 24,
  line_enabled boolean not null default false,
  reminder_enabled boolean not null default true,
  google_calendar_enabled boolean not null default false,
  public_booking_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.stores
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists description text,
  add column if not exists hero_image_url text;

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  role text not null default 'Staff',
  active boolean not null default true,
  color text not null default '#0f766e',
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.services
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists route text,
  add column if not exists highlights text[] not null default '{}',
  add column if not exists cover_image_url text,
  add column if not exists rating numeric(3,2) not null default 4.80,
  add column if not exists review_count integer not null default 0,
  add column if not exists max_guests integer not null default 4,
  add column if not exists remaining_seats integer not null default 4,
  add column if not exists featured boolean not null default false;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null default '',
  memo text not null default '',
  line_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists customers_store_email_idx on public.customers(store_id, lower(email));

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  staff_id uuid not null references public.staff_members(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'completed', 'canceled', 'no_show')),
  memo text not null default '',
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'refunded')),
  payment_url text,
  line_notification_status text not null default 'pending'
    check (line_notification_status in ('pending', 'sent', 'failed', 'disabled')),
  reminder_status text not null default 'pending'
    check (reminder_status in ('pending', 'sent', 'skipped')),
  google_event_id text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists reservations_store_starts_idx on public.reservations(store_id, starts_at);
create index if not exists reservations_staff_starts_idx on public.reservations(staff_id, starts_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_staff_no_overlap'
  ) then
    alter table public.reservations
      add constraint reservations_staff_no_overlap
      exclude using gist (
        staff_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status <> 'canceled');
  end if;
end $$;

create or replace function public.is_store_owner(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores
    where id = target_store_id
      and owner_id = auth.uid()
  );
$$;

alter table public.stores enable row level security;
alter table public.staff_members enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "stores readable by owner or public" on public.stores;
create policy "stores readable by owner or public"
on public.stores for select
using (owner_id = auth.uid() or public_booking_enabled = true);

drop policy if exists "stores insert by owner" on public.stores;
create policy "stores insert by owner"
on public.stores for insert
with check (owner_id = auth.uid());

drop policy if exists "stores update by owner" on public.stores;
create policy "stores update by owner"
on public.stores for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "stores delete by owner" on public.stores;
create policy "stores delete by owner"
on public.stores for delete
using (owner_id = auth.uid());

drop policy if exists "staff readable by owner or public store" on public.staff_members;
create policy "staff readable by owner or public store"
on public.staff_members for select
using (
  public.is_store_owner(store_id)
  or exists (select 1 from public.stores where id = store_id and public_booking_enabled = true)
);

drop policy if exists "staff write by owner" on public.staff_members;
create policy "staff write by owner"
on public.staff_members for all
using (public.is_store_owner(store_id))
with check (public.is_store_owner(store_id));

drop policy if exists "services readable by owner or public store" on public.services;
create policy "services readable by owner or public store"
on public.services for select
using (
  public.is_store_owner(store_id)
  or exists (select 1 from public.stores where id = store_id and public_booking_enabled = true)
);

drop policy if exists "services write by owner" on public.services;
create policy "services write by owner"
on public.services for all
using (public.is_store_owner(store_id))
with check (public.is_store_owner(store_id));

drop policy if exists "customers readable by owner" on public.customers;
create policy "customers readable by owner"
on public.customers for select
using (public.is_store_owner(store_id));

drop policy if exists "customers insert by owner or public" on public.customers;
create policy "customers insert by owner or public"
on public.customers for insert
with check (
  public.is_store_owner(store_id)
  or exists (select 1 from public.stores where id = store_id and public_booking_enabled = true)
);

drop policy if exists "customers update by owner" on public.customers;
create policy "customers update by owner"
on public.customers for update
using (public.is_store_owner(store_id))
with check (public.is_store_owner(store_id));

drop policy if exists "customers delete by owner" on public.customers;
create policy "customers delete by owner"
on public.customers for delete
using (public.is_store_owner(store_id));

drop policy if exists "reservations readable by owner or public store" on public.reservations;
create policy "reservations readable by owner or public store"
on public.reservations for select
using (
  public.is_store_owner(store_id)
  or exists (select 1 from public.stores where id = store_id and public_booking_enabled = true)
);

drop policy if exists "reservations insert by owner or public" on public.reservations;
create policy "reservations insert by owner or public"
on public.reservations for insert
with check (
  public.is_store_owner(store_id)
  or exists (select 1 from public.stores where id = store_id and public_booking_enabled = true)
);

drop policy if exists "reservations update by owner" on public.reservations;
create policy "reservations update by owner"
on public.reservations for update
using (public.is_store_owner(store_id))
with check (public.is_store_owner(store_id));

drop policy if exists "reservations delete by owner" on public.reservations;
create policy "reservations delete by owner"
on public.reservations for delete
using (public.is_store_owner(store_id));

create or replace view public.store_daily_sales as
select
  r.store_id,
  date_trunc('day', r.starts_at) as sales_day,
  count(*) filter (where r.status <> 'canceled') as reservation_count,
  coalesce(sum(s.price_cents) filter (where r.payment_status = 'paid'), 0) as paid_revenue_cents
from public.reservations r
join public.services s on s.id = r.service_id
group by r.store_id, date_trunc('day', r.starts_at);
