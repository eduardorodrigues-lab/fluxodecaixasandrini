create table public.org_invites(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('editor','viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null, created_at timestamptz not null default now(),
  accepted_at timestamptz, accepted_by uuid, revoked_at timestamptz, revoked_by uuid);
create table public.access_log(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor uuid not null, actor_email text, action text not null,
  target_user uuid, target_email text, role text, at timestamptz not null default now(), detail jsonb not null default '{}'::jsonb);
create index on public.access_log(org_id, at desc);
grant select on public.org_invites, public.access_log to authenticated;
grant all on public.org_invites, public.access_log to service_role;
alter table public.org_invites enable row level security;
alter table public.access_log enable row level security;

create or replace function public.is_org_owner(_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.org_members where org_id = _org and user_id = auth.uid() and role = 'owner')
$$;
create policy "owner le membros da org" on public.org_members for select to authenticated using (public.is_org_owner(org_id));
create policy "owner le convites" on public.org_invites for select to authenticated using (public.is_org_owner(org_id));
create policy "owner le log de acesso" on public.access_log for select to authenticated using (public.is_org_owner(org_id));

create or replace function public.team_create_invite(_org uuid, _actor uuid, _actor_email text, _email text, _role text, _hash text, _expires timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not exists(select 1 from org_members where org_id=_org and user_id=_actor and role='owner') then return jsonb_build_object('status','forbidden'); end if;
  if _role not in ('editor','viewer') or _expires <= now() or _expires > now() + interval '30 days' then return jsonb_build_object('status','invalid'); end if;
  insert into org_invites(org_id,email,role,token_hash,expires_at,created_by) values (_org, lower(trim(_email)), _role, _hash, _expires, _actor) returning id into _id;
  insert into access_log(org_id,actor,actor_email,action,target_email,role,detail) values (_org,_actor,_actor_email,'convite_criado',lower(trim(_email)),_role,jsonb_build_object('invite',_id,'expires_at',_expires));
  return jsonb_build_object('status','ok','id',_id);
end $$;

create or replace function public.team_revoke_invite(_org uuid, _actor uuid, _actor_email text, _invite uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _inv org_invites;
begin
  if not exists(select 1 from org_members where org_id=_org and user_id=_actor and role='owner') then return jsonb_build_object('status','forbidden'); end if;
  select * into _inv from org_invites where id=_invite and org_id=_org for update;
  if _inv.id is null or _inv.accepted_at is not null or _inv.revoked_at is not null then return jsonb_build_object('status','invalid'); end if;
  update org_invites set revoked_at=now(), revoked_by=_actor where id=_invite;
  insert into access_log(org_id,actor,actor_email,action,target_email,role,detail) values (_org,_actor,_actor_email,'convite_revogado',_inv.email,_inv.role,jsonb_build_object('invite',_invite));
  return jsonb_build_object('status','ok');
end $$;

create or replace function public.team_invite_info(_hash text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('status','ok','org_name',o.name,'email',i.email,'role',i.role,'expires_at',i.expires_at,
    'state', case when i.revoked_at is not null then 'revogado' when i.accepted_at is not null then 'aceito' when i.expires_at <= now() then 'expirado' else 'pendente' end)
    from org_invites i join organizations o on o.id=i.org_id where i.token_hash=_hash), jsonb_build_object('status','not_found'))
$$;

create or replace function public.team_accept_invite(_hash text, _user uuid, _email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _inv org_invites;
begin
  select * into _inv from org_invites where token_hash=_hash for update;
  if _inv.id is null then return jsonb_build_object('status','not_found'); end if;
  if _inv.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
  if _inv.accepted_at is not null then return jsonb_build_object('status','used'); end if;
  if _inv.expires_at <= now() then return jsonb_build_object('status','expired'); end if;
  if _email is null or lower(trim(_email)) <> _inv.email then return jsonb_build_object('status','email_mismatch'); end if;
  if exists(select 1 from org_members where org_id=_inv.org_id and user_id=_user) then return jsonb_build_object('status','already_member'); end if;
  insert into org_members(org_id,user_id,role) values (_inv.org_id,_user,_inv.role);
  update org_invites set accepted_at=now(), accepted_by=_user where id=_inv.id;
  insert into access_log(org_id,actor,actor_email,action,target_user,target_email,role,detail) values (_inv.org_id,_user,lower(_email),'convite_aceito',_user,_inv.email,_inv.role,jsonb_build_object('invite',_inv.id));
  return jsonb_build_object('status','ok','org_id',_inv.org_id);
end $$;

create or replace function public.team_remove_member(_org uuid, _actor uuid, _actor_email text, _user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _role text;
begin
  if not exists(select 1 from org_members where org_id=_org and user_id=_actor and role='owner') then return jsonb_build_object('status','forbidden'); end if;
  perform 1 from org_members where org_id=_org for update;
  select role into _role from org_members where org_id=_org and user_id=_user;
  if _role is null then return jsonb_build_object('status','invalid'); end if;
  if _role='owner' and (select count(*) from org_members where org_id=_org and role='owner') <= 1 then return jsonb_build_object('status','last_owner'); end if;
  delete from org_members where org_id=_org and user_id=_user;
  insert into access_log(org_id,actor,actor_email,action,target_user,role) values (_org,_actor,_actor_email,'acesso_revogado',_user,_role);
  return jsonb_build_object('status','ok');
end $$;

create or replace function public.team_members(_org uuid, _actor uuid)
returns table(user_id uuid, email text, role text, created_at timestamptz) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists(select 1 from org_members m where m.org_id=_org and m.user_id=_actor and m.role='owner') then return; end if;
  return query select m.user_id, u.email::text, m.role, m.created_at from org_members m left join auth.users u on u.id=m.user_id where m.org_id=_org order by m.created_at;
end $$;

revoke execute on function public.team_create_invite(uuid,uuid,text,text,text,text,timestamptz), public.team_revoke_invite(uuid,uuid,text,uuid), public.team_invite_info(text), public.team_accept_invite(text,uuid,text), public.team_remove_member(uuid,uuid,text,uuid), public.team_members(uuid,uuid) from public, anon, authenticated;
grant execute on function public.team_create_invite(uuid,uuid,text,text,text,text,timestamptz), public.team_revoke_invite(uuid,uuid,text,uuid), public.team_invite_info(text), public.team_accept_invite(text,uuid,text), public.team_remove_member(uuid,uuid,text,uuid), public.team_members(uuid,uuid) to service_role;