-- Teste controlado de autorização (usuários FICTÍCIOS). Termina com RAISE → transação inteira desfeita.
-- Resultado obtido em 28/10/2026: viewer_grava=forbidden editor_grava=ok naomembro_grava=forbidden editor_convida=forbidden
-- owner_convida=ok outro_email=email_mismatch expirado=expired revogado=revoked aceito=ok reuso=used
-- remove_ultimo_owner=last_owner remove_viewer=ok logs=5 estranho_le=0
do $$
declare o uuid := gen_random_uuid(); ow uuid := gen_random_uuid(); ed uuid := gen_random_uuid(); vw uuid := gen_random_uuid(); nm uuid := gen_random_uuid();
r text := ''; x jsonb; n int;
begin
  insert into organizations(id,name,created_by) values (o,'TESTE-ROLLBACK',ow);
  insert into org_members values (o,ow,'owner',now()),(o,ed,'editor',now()),(o,vw,'viewer',now());
  insert into official_data(org_id) values (o);
  x := commit_official(o,vw,'v@t',0,'{}'::jsonb,gen_random_uuid(),'s','[]'::jsonb); r := r||' viewer_grava='||(x->>'status');
  x := commit_official(o,ed,'e@t',0,'{"a":1}'::jsonb,gen_random_uuid(),'s','[]'::jsonb); r := r||' editor_grava='||(x->>'status');
  x := commit_official(o,nm,'n@t',1,'{}'::jsonb,gen_random_uuid(),'s','[]'::jsonb); r := r||' naomembro_grava='||(x->>'status');
  x := team_create_invite(o,ed,'e@t','a@t.com','viewer','h0',now()+interval '1 day'); r := r||' editor_convida='||(x->>'status');
  x := team_create_invite(o,ow,'o@t','a@t.com','viewer','h1',now()+interval '1 day'); r := r||' owner_convida='||(x->>'status');
  x := team_accept_invite('h1',nm,'outro@t.com'); r := r||' outro_email='||(x->>'status');
  insert into org_invites(org_id,email,role,token_hash,expires_at,created_by) values (o,'b@t.com','editor','h2',now()-interval '1 minute',ow);
  x := team_accept_invite('h2',nm,'b@t.com'); r := r||' expirado='||(x->>'status');
  x := team_create_invite(o,ow,'o@t','c@t.com','editor','h3',now()+interval '1 day');
  perform team_revoke_invite(o,ow,'o@t',(x->>'id')::uuid);
  x := team_accept_invite('h3',nm,'c@t.com'); r := r||' revogado='||(x->>'status');
  x := team_accept_invite('h1',nm,'A@t.com'); r := r||' aceito='||(x->>'status');
  x := team_accept_invite('h1',nm,'a@t.com'); r := r||' reuso='||(x->>'status');
  x := team_remove_member(o,ow,'o@t',ow); r := r||' remove_ultimo_owner='||(x->>'status');
  x := team_remove_member(o,ow,'o@t',vw); r := r||' remove_viewer='||(x->>'status');
  select count(*) into n from access_log where org_id=o; r := r||' logs='||n;
  perform set_config('request.jwt.claims', json_build_object('sub',gen_random_uuid(),'role','authenticated')::text, true);
  perform set_config('role','authenticated',true);
  select count(*) into n from official_data where org_id=o; r := r||' estranho_le='||n;
  raise exception 'RESULTADO:%', r;
end $$;
