-- Usage quotas + RevenueCat-verified entitlements.

create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,                -- 'YYYY-MM'
  note_count integer not null default 0,
  primary key (user_id, month)
);

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default false,
  expires_at timestamptz,
  product_id text,
  verified boolean not null default false,  -- false = 24h client-claim grace row
  -- RevenueCat event_timestamp_ms of the last webhook write; rc-webhook uses
  -- it to drop out-of-order events (RC guarantees neither ordering nor
  -- at-most-once delivery). Null on grace rows created by extract-job, so
  -- the webhook's first real event always wins over a grace row.
  last_event_at bigint,
  updated_at timestamptz not null default now()
);

alter table public.usage enable row level security;
alter table public.entitlements enable row level security;

-- Users may read their own rows (writes happen only via service role).
create policy "read own usage" on public.usage for select to authenticated
  using (user_id = auth.uid());
create policy "read own entitlement" on public.entitlements for select to authenticated
  using (user_id = auth.uid());

-- Atomic increment used by extract-job after successful extraction.
create or replace function public.increment_usage(p_user_id uuid, p_month text)
returns void language sql security definer set search_path = public as $$
  insert into public.usage (user_id, month, note_count)
  values (p_user_id, p_month, 1)
  on conflict (user_id, month) do update set note_count = usage.note_count + 1;
$$;

-- Only the service role (via extract-job) may increment usage; without this,
-- any authenticated user could call the security-definer function via PostgREST
-- and inflate note counts (their own or others') — quota griefing.
revoke execute on function public.increment_usage(uuid, text) from public, anon, authenticated;
