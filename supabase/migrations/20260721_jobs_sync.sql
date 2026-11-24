-- Cloud mirror of local jobs/line_items for backup/restore. Client-writable
-- (unlike usage/entitlements): RLS restricts every op to the owner's rows.
-- Timestamps are ISO-8601 TEXT to mirror SQLite exactly (LWW compares strings).
--
-- Two timestamp domains, deliberately separate:
--   * updated_at (text)               — device-authored: "when did a human change
--     this". Written by clients, used ONLY as the last-write-wins comparator.
--   * server_updated_at (timestamptz) — server-authoritative: "when did the
--     server learn this". Set by trigger on every insert/update, immune to
--     device clock skew, used ONLY as the incremental-pull watermark.

-- Ownership is part of the key: restore switches the device to a different
-- uid (the original account), and the same locally-generated job id may
-- already exist under the abandoned throwaway anonymous uid. With a bare
-- `id` PK those post-restore pushes would collide with rows RLS forbids
-- touching and fail forever; keyed by (user_id, id) each account owns its
-- own copy. Rows under the abandoned uid remain orphaned until
-- account-deletion work cleans them up.
create table if not exists public.jobs (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null default '',
  client_phone text not null default '',
  client_email text not null default '',
  client_address text not null default '',
  title text not null,
  description text not null default '',
  status text not null default 'draft',
  transcript text not null default '',
  notes text not null default '',
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Keep server_updated_at server-authoritative: overwrite whatever the client
-- sent (or omitted) on every write.
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin new.server_updated_at = now(); return new; end; $$;
create trigger jobs_touch_server_updated
  before insert or update on public.jobs
  for each row execute function public.touch_server_updated_at();

create table if not exists public.line_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  kind text not null,
  description text not null default '',
  qty double precision not null default 1,
  unit text not null default '',
  unit_price double precision,
  low_confidence integer not null default 0,
  checked integer not null default 0,
  primary key (user_id, id),
  -- Composite FK mirrors the per-user jobs key above.
  foreign key (user_id, job_id) references public.jobs (user_id, id) on delete cascade
);

-- Incremental pulls filter on server_updated_at (the watermark column).
create index if not exists jobs_user_server_updated on public.jobs (user_id, server_updated_at);

alter table public.jobs enable row level security;
alter table public.line_items enable row level security;

create policy "own jobs" on public.jobs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own line items" on public.line_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
