create table public.organizations(id uuid primary key default gen_random_uuid(), name text not null, created_by uuid not null, created_at timestamptz not null default now());
create table public.org_members(org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null, role text not null check (role in ('owner','editor','viewer')), created_at timestamptz not null default now(), primary key(org_id,user_id));
create table public.official_data(org_id uuid primary key references public.organizations(id) on delete cascade, data jsonb not null default '{}'::jsonb, version int not null default 0, updated_at timestamptz not null default now(), updated_by uuid);
create table public.audit_log(id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null, user_email text, at timestamptz not null default now(), version_from int not null, version_to int not null, request_id uuid not null unique, summary text not null, changes jsonb not null, snapshot_before jsonb);
create index on public.audit_log(org_id, at desc);

grant select on public.organizations, public.org_members, public.official_data, public.audit_log to authenticated;
grant all on public.organizations, public.org_members, public.official_data, public.audit_log to service_role;

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.official_data enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.is_org_member(_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.org_members where org_id = _org and user_id = auth.uid())
$$;

create policy "membros leem org" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "membro le propria filiacao" on public.org_members for select to authenticated using (user_id = auth.uid());
create policy "membros leem dados" on public.official_data for select to authenticated using (public.is_org_member(org_id));
create policy "membros leem auditoria" on public.audit_log for select to authenticated using (public.is_org_member(org_id));

-- Cada novo usuário recebe SUA PRÓPRIA organização (sem autoinscrição em organização existente).
create or replace function public.handle_new_user_org() returns trigger language plpgsql security definer set search_path = public as $$
declare _org uuid;
begin
  insert into public.organizations(name, created_by) values ('Organização de ' || coalesce(new.email, new.id::text), new.id) returning id into _org;
  insert into public.org_members(org_id, user_id, role) values (_org, new.id, 'owner');
  insert into public.official_data(org_id, data, version) values (_org, '{}'::jsonb, 0);
  return new;
end $$;
create trigger on_auth_user_created_org after insert on auth.users for each row execute function public.handle_new_user_org();

-- Gravação oficial: somente via servidor (service_role), com controle de versão, idempotência e auditoria.
create or replace function public.commit_official(_org uuid, _user uuid, _email text, _expected int, _data jsonb, _request uuid, _summary text, _changes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _cur public.official_data; _role text;
begin
  if exists(select 1 from public.audit_log where request_id = _request) then
    select * into _cur from public.official_data where org_id = _org;
    return jsonb_build_object('status','duplicate','version',_cur.version);
  end if;
  select role into _role from public.org_members where org_id = _org and user_id = _user;
  if _role is null or _role not in ('owner','editor') then
    return jsonb_build_object('status','forbidden');
  end if;
  select * into _cur from public.official_data where org_id = _org for update;
  if _cur.version <> _expected then
    return jsonb_build_object('status','conflict','version',_cur.version);
  end if;
  update public.official_data set data = _data, version = _cur.version + 1, updated_at = now(), updated_by = _user where org_id = _org;
  insert into public.audit_log(org_id, user_id, user_email, version_from, version_to, request_id, summary, changes, snapshot_before)
    values (_org, _user, _email, _cur.version, _cur.version + 1, _request, _summary, _changes, _cur.data);
  return jsonb_build_object('status','ok','version',_cur.version + 1);
end $$;
revoke execute on function public.commit_official(uuid, uuid, text, int, jsonb, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.commit_official(uuid, uuid, text, int, jsonb, uuid, text, jsonb) to service_role;
revoke execute on function public.handle_new_user_org() from public, anon, authenticated;