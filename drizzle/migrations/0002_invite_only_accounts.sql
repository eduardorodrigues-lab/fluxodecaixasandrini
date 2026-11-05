alter table public.org_invites add column if not exists full_name text, add column if not exists sector text;
alter table public.org_members add column if not exists full_name text, add column if not exists sector text;

create or replace function public.handle_new_user_org() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare _org uuid;
begin
  -- Contas criadas por convite não recebem organização própria.
  if coalesce(new.raw_app_meta_data->>'invited','') = 'true' then return new; end if;
  insert into public.organizations(name, created_by) values ('Grupo Sandrini', new.id) returning id into _org;
  insert into public.org_members(org_id, user_id, role, full_name) values (_org, new.id, 'owner', new.raw_user_meta_data->>'full_name');
  insert into public.official_data(org_id, data, version) values (_org, '{}'::jsonb, 0);
  return new;
end $$;

drop function if exists public.team_create_invite(uuid,uuid,text,text,text,text,timestamptz);
create function public.team_create_invite(_org uuid, _actor uuid, _actor_email text, _email text, _role text, _hash text, _expires timestamptz, _name text, _sector text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare _id uuid;
begin
  if not exists(select 1 from org_members where org_id=_org and user_id=_actor and role='owner') then return jsonb_build_object('status','forbidden'); end if;
  if _role not in ('editor','viewer') or _expires <= now() or _expires > now() + interval '30 days' or coalesce(trim(_name),'')='' or coalesce(trim(_sector),'')='' then return jsonb_build_object('status','invalid'); end if;
  insert into org_invites(org_id,email,role,token_hash,expires_at,created_by,full_name,sector) values (_org, lower(trim(_email)), _role, _hash, _expires, _actor, trim(_name), trim(_sector)) returning id into _id;
  insert into access_log(org_id,actor,actor_email,action,target_email,role,detail) values (_org,_actor,_actor_email,'convite_criado',lower(trim(_email)),_role,jsonb_build_object('invite',_id,'expires_at',_expires,'nome',trim(_name),'setor',trim(_sector)));
  return jsonb_build_object('status','ok','id',_id);
end $$;

create or replace function public.team_invite_info(_hash text) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((select jsonb_build_object('status','ok','org_name',o.name,'email',i.email,'role',i.role,'expires_at',i.expires_at,'full_name',i.full_name,'sector',i.sector,
    'state', case when i.revoked_at is not null then 'revogado' when i.accepted_at is not null then 'aceito' when i.expires_at <= now() then 'expirado' else 'pendente' end)
    from org_invites i join organizations o on o.id=i.org_id where i.token_hash=_hash), jsonb_build_object('status','not_found'))
$$;

create or replace function public.team_accept_invite(_hash text, _user uuid, _email text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare _inv org_invites;
begin
  select * into _inv from org_invites where token_hash=_hash for update;
  if _inv.id is null then return jsonb_build_object('status','not_found'); end if;
  if _inv.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
  if _inv.accepted_at is not null then return jsonb_build_object('status','used'); end if;
  if _inv.expires_at <= now() then return jsonb_build_object('status','expired'); end if;
  if _email is null or lower(trim(_email)) <> _inv.email then return jsonb_build_object('status','email_mismatch'); end if;
  if exists(select 1 from org_members where org_id=_inv.org_id and user_id=_user) then return jsonb_build_object('status','already_member'); end if;
  insert into org_members(org_id,user_id,role,full_name,sector) values (_inv.org_id,_user,_inv.role,_inv.full_name,_inv.sector);
  update org_invites set accepted_at=now(), accepted_by=_user where id=_inv.id;
  insert into access_log(org_id,actor,actor_email,action,target_user,target_email,role,detail) values (_inv.org_id,_user,lower(_email),'convite_aceito',_user,_inv.email,_inv.role,jsonb_build_object('invite',_inv.id));
  return jsonb_build_object('status','ok','org_id',_inv.org_id);
end $$;

drop function if exists public.team_members(uuid,uuid);
create function public.team_members(_org uuid, _actor uuid) returns table(user_id uuid, email text, role text, created_at timestamptz, full_name text, sector text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not exists(select 1 from org_members m where m.org_id=_org and m.user_id=_actor and m.role='owner') then return; end if;
  return query select m.user_id, u.email::text, m.role, m.created_at, m.full_name, m.sector from org_members m left join auth.users u on u.id=m.user_id where m.org_id=_org order by m.created_at;
end $$;

revoke execute on function public.team_create_invite(uuid,uuid,text,text,text,text,timestamptz,text,text) from public, anon, authenticated;
revoke execute on function public.team_members(uuid,uuid) from public, anon, authenticated;
grant execute on function public.team_create_invite(uuid,uuid,text,text,text,text,timestamptz,text,text) to service_role;
grant execute on function public.team_members(uuid,uuid) to service_role;