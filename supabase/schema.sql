-- Motiq cloud: accounts, teams and sync.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
-- Safe to run again: it only creates what's missing and replaces the functions and policies.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  join_code text unique not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),  -- athletes join with this
  staff_code text unique not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)), -- coaches join with this
  solo boolean not null default false,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('coach', 'athlete')),
  athlete_id text,                                   -- which athlete in the team this login is
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- One row per app record (an athlete, a session, a message, ...). The app merges these offline.
create table if not exists public.records (
  team_id uuid not null references public.teams on delete cascade,
  coll text not null,                                -- collection, e.g. 'assignments'
  id text not null,
  data jsonb,
  athlete_id text,                                   -- set when the record belongs to one athlete
  is_private boolean not null default false,         -- only the login that wrote it can read it
  owner uuid default auth.uid(),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (team_id, coll, id)
);
create index if not exists records_team_updated on public.records (team_id, updated_at);

-- One-time codes that link a login to an athlete the coach already added.
create table if not exists public.athlete_invites (
  code text primary key default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  team_id uuid not null references public.teams on delete cascade,
  athlete_id text not null,
  created_at timestamptz not null default now(),
  unique (team_id, athlete_id)
);

-- Parent / guardian approval for athletes under 18. The athlete gets a code; a parent signs in with
-- their own account and approves. Until then coaches can't read that athlete's records.
create table if not exists public.guardian_links (
  team_id uuid not null references public.teams on delete cascade,
  athlete_id text not null,
  code text unique not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  guardian uuid references auth.users on delete set null,
  guardian_name text not null default '',
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (team_id, athlete_id)
);

-- Claude requests per team per day (written by the claude edge function).
create table if not exists public.ai_usage (
  team_id uuid not null references public.teams on delete cascade,
  day date not null default current_date,
  requests int not null default 0,
  primary key (team_id, day)
);

-- Server clock decides the sync order.
create or replace function public.touch_record() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then new.owner := old.owner; end if;
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records for each row execute function public.touch_record();

-- ---------- helpers (run as the table owner so policies can use them) ----------

create or replace function public.my_role(t uuid) returns text language sql stable security definer set search_path = public as $$
  select role from team_members where team_id = t and user_id = auth.uid()
$$;
create or replace function public.my_athlete(t uuid) returns text language sql stable security definer set search_path = public as $$
  select athlete_id from team_members where team_id = t and user_id = auth.uid()
$$;

-- Create a team; the creator is its first coach (or a solo athlete's private space).
create or replace function public.create_team(team_name text, is_solo boolean default false, my_athlete_id text default null)
returns public.teams language plpgsql security definer set search_path = public as $$
declare t teams;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into teams (name, solo, created_by) values (coalesce(team_name, ''), is_solo, auth.uid()) returning * into t;
  insert into team_members (team_id, user_id, role, athlete_id) values (t.id, auth.uid(), case when is_solo then 'athlete' else 'coach' end, my_athlete_id);
  return t;
end $$;

-- Join with a code:
--   an athlete invite code links you to that athlete (your coach made it for you)
--   the team code makes you a new athlete on the team
--   the staff code makes you a coach
create or replace function public.join_team(code text)
returns table (team_id uuid, team_name text, role text, athlete_id text) language plpgsql security definer set search_path = public as $$
declare t teams; r text; inv athlete_invites; c text := upper(trim(code));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from athlete_invites i where i.code = c;
  if found then
    if exists (select 1 from team_members m where m.team_id = inv.team_id and m.athlete_id = inv.athlete_id and m.user_id <> auth.uid()) then
      raise exception 'Someone has already used that invite';
    end if;
    select * into t from teams where id = inv.team_id;
    insert into team_members as m (team_id, user_id, role, athlete_id) values (t.id, auth.uid(), 'athlete', inv.athlete_id)
      on conflict on constraint team_members_pkey do update set athlete_id = case when m.role = 'coach' then m.athlete_id else excluded.athlete_id end;
    delete from athlete_invites i where i.code = c;
  else
    select * into t from teams where join_code = c and not solo;
    if found then r := 'athlete';
    else
      select * into t from teams where staff_code = c and not solo;
      if found then r := 'coach'; else raise exception 'That code didn''t match a team'; end if;
    end if;
    insert into team_members as m (team_id, user_id, role) values (t.id, auth.uid(), r)
      on conflict on constraint team_members_pkey do update set role = case when m.role = 'coach' then 'coach' else excluded.role end;
  end if;
  return query select t.id, t.name, m.role, m.athlete_id from team_members m where m.team_id = t.id and m.user_id = auth.uid();
end $$;

-- A new athlete (joined with the team code) creates their own athlete. Only an id nobody has.
create or replace function public.set_my_athlete(t uuid, a text) returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role(t) is distinct from 'athlete' or my_athlete(t) is not null then raise exception 'You''re already linked to an athlete'; end if;
  if exists (select 1 from records r where r.team_id = t and r.coll in ('athletes', 'roster') and r.id = a)
     or exists (select 1 from team_members m where m.team_id = t and m.athlete_id = a) then
    raise exception 'That athlete already exists. Ask your coach for your invite code.';
  end if;
  update team_members set athlete_id = a where team_id = t and user_id = auth.uid();
end $$;

-- Coaches make an invite code for an athlete on the roster.
create or replace function public.invite_athlete(t uuid, a text) returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if my_role(t) is distinct from 'coach' then raise exception 'Only coaches can invite athletes'; end if;
  insert into athlete_invites (team_id, athlete_id) values (t, a)
    on conflict (team_id, athlete_id) do update set created_at = now() returning code into c;
  return c;
end $$;

-- Coaches can get new codes (e.g. after a code is shared too widely).
create or replace function public.new_codes(t uuid) returns public.teams language plpgsql security definer set search_path = public as $$
declare r teams;
begin
  if my_role(t) is distinct from 'coach' then raise exception 'Only coaches can change codes'; end if;
  update teams set join_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)), staff_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)) where id = t returning * into r;
  return r;
end $$;

-- ---------- parents ----------

-- True while an under-18 athlete is waiting on a parent's approval.
create or replace function public.awaiting_parent(t uuid, a text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardian_links g where g.team_id = t and g.athlete_id = a and g.consent_at is null)
$$;

-- The athlete asks for their parent code (made once, then reused).
create or replace function public.guardian_code(t uuid) returns text language plpgsql security definer set search_path = public as $$
declare a text := my_athlete(t); c text;
begin
  if a is null or my_role(t) is distinct from 'athlete' then raise exception 'Join your team as an athlete first'; end if;
  insert into guardian_links (team_id, athlete_id) values (t, a) on conflict (team_id, athlete_id) do nothing;
  select code into c from guardian_links where team_id = t and athlete_id = a;
  return c;
end $$;

-- What a parent sees before approving: the athlete's name and team.
create or replace function public.guardian_lookup(c text) returns table (code text, team_name text, athlete_name text, consent_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select g.code, t.name, coalesce(r.data->>'name', ''), g.consent_at, g.guardian = auth.uid()
  from guardian_links g join teams t on t.id = g.team_id
  left join records r on r.team_id = g.team_id and r.coll = 'roster' and r.id = g.athlete_id
  where g.code = upper(trim(c)) and auth.uid() is not null
$$;

-- A parent approves (agree = true) or withdraws (agree = false).
create or replace function public.guardian_set(c text, agree boolean, gname text default '') returns void language plpgsql security definer set search_path = public as $$
declare g guardian_links;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from guardian_links where code = upper(trim(c));
  if not found then raise exception 'That parent code didn''t match'; end if;
  if g.guardian is not null and g.guardian <> auth.uid() then raise exception 'Another parent already manages this athlete'; end if;
  if g.athlete_id = my_athlete(g.team_id) then raise exception 'A parent or guardian has to approve this from their own account'; end if;
  update guardian_links set guardian = auth.uid(), guardian_name = coalesce(nullif(trim(gname), ''), guardian_name),
    consent_at = case when agree then now() else null end
  where team_id = g.team_id and athlete_id = g.athlete_id;
end $$;

-- Approval status: coaches see the whole team, an athlete sees their own.
create or replace function public.consents(t uuid) returns table (athlete_id text, consent_at timestamptz, guardian_name text)
language sql stable security definer set search_path = public as $$
  select g.athlete_id, g.consent_at, g.guardian_name from guardian_links g
  where g.team_id = t and (my_role(t) = 'coach' or g.athlete_id = my_athlete(t))
$$;

-- A parent's own list.
create or replace function public.my_children() returns table (code text, team_name text, athlete_name text, consent_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.code, t.name, coalesce(r.data->>'name', ''), g.consent_at
  from guardian_links g join teams t on t.id = g.team_id
  left join records r on r.team_id = g.team_id and r.coll = 'roster' and r.id = g.athlete_id
  where g.guardian = auth.uid()
$$;

grant execute on function public.guardian_code(uuid), public.guardian_lookup(text), public.guardian_set(text, boolean, text), public.consents(uuid), public.my_children() to authenticated;

-- ---------- row-level security ----------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.records enable row level security;
alter table public.ai_usage enable row level security;
alter table public.athlete_invites enable row level security; -- only reachable through the functions above
alter table public.guardian_links enable row level security;  -- likewise

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select using (public.my_role(id) is not null);
drop policy if exists teams_rename on public.teams;
create policy teams_rename on public.teams for update using (public.my_role(id) = 'coach');

drop policy if exists members_read on public.team_members;
create policy members_read on public.team_members for select using (user_id = auth.uid() or public.my_role(team_id) = 'coach');
drop policy if exists members_leave on public.team_members;
create policy members_leave on public.team_members for delete using (user_id = auth.uid() or public.my_role(team_id) = 'coach');

-- Who can see a record:
--   private records: only the login that wrote them
--   coaches: everything else in the team, except an under-18 athlete's own data (profile, check-ins,
--            workouts, videos, injuries) until a parent approves
--   athletes: team-wide records (no athlete_id) and their own athlete's records, never teammates'
drop policy if exists records_read on public.records;
create policy records_read on public.records for select using (
  case when is_private then owner = auth.uid()
       else (public.my_role(team_id) = 'coach' and (athlete_id is null or coll not in ('athletes', 'videos', 'analyses', 'injuries') or not public.awaiting_parent(team_id, athlete_id)))
         or (public.my_role(team_id) = 'athlete' and (athlete_id is null or athlete_id = public.my_athlete(team_id)))
  end
);
-- Who can write: coaches anything shared; athletes only their own athlete's records and their roster card.
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert with check (
  public.my_role(team_id) is not null and (
    (is_private and owner = auth.uid())
    or (not is_private and public.my_role(team_id) = 'coach')
    or (not is_private and public.my_role(team_id) = 'athlete' and athlete_id is not null and athlete_id = public.my_athlete(team_id))
    or (not is_private and public.my_role(team_id) = 'athlete' and coll = 'roster' and id = public.my_athlete(team_id))
  )
);
drop policy if exists records_update on public.records;
create policy records_update on public.records for update using (
  case when is_private then owner = auth.uid()
       else public.my_role(team_id) = 'coach'
         or (public.my_role(team_id) = 'athlete' and ((athlete_id is not null and athlete_id = public.my_athlete(team_id)) or (coll = 'roster' and id = public.my_athlete(team_id))))
  end
) with check (
  (is_private and owner = auth.uid())
  or (not is_private and public.my_role(team_id) = 'coach')
  or (not is_private and public.my_role(team_id) = 'athlete' and ((athlete_id is not null and athlete_id = public.my_athlete(team_id)) or (coll = 'roster' and id = public.my_athlete(team_id))))
);

drop policy if exists usage_read on public.ai_usage;
create policy usage_read on public.ai_usage for select using (public.my_role(team_id) = 'coach');

grant execute on function public.create_team(text, boolean, text), public.join_team(text), public.set_my_athlete(uuid, text), public.new_codes(uuid), public.invite_athlete(uuid, text) to authenticated;

-- Members list for coaches (who has signed in, and as which athlete).
create or replace function public.team_logins(t uuid) returns table (user_id uuid, email text, role text, athlete_id text) language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.athlete_id from team_members m join auth.users u on u.id = m.user_id where m.team_id = t and my_role(t) = 'coach'
$$;
grant execute on function public.team_logins(uuid) to authenticated;
