-- Teste controlado no SERVIDOR (organização e usuários FICTÍCIOS). Termina com RAISE → transação inteira desfeita;
-- nenhum dado real é lido ou gravado. Valida commit_official: papel, versão, idempotência por request_id e RLS de leitura.
-- Resultado obtido em 19/11/2026: editor_1a=ok:1 mesmo_request=duplicate:1 mesmo_request_outra_versao=duplicate versao_final=1 auditorias_do_request=1
-- versao_antiga=conflict leitor_grava=forbidden org_alheia_grava=forbidden dado_final=1 auditorias_org=1 leitor_le_propria=1
-- leitor_le_alheia=0 leitor_le_auditoria_alheia=0 estranho_le=0 estranho_le_auditoria=0 (organizações TESTE-ROLLBACK após o teste: 0)
-- Não coberto aqui: duas sessões simultâneas com o mesmo request_id (uma transação só). Por leitura: a segunda espera o
-- FOR UPDATE, recebe conflict sem gravar; commitOps reconfere audit_log e devolve duplicate. Índice único em request_id.
do $$
declare o uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); ow uuid := gen_random_uuid(); ed uuid := gen_random_uuid();
vw uuid := gen_random_uuid(); fx uuid := gen_random_uuid(); rq uuid := gen_random_uuid(); r text := ''; x jsonb; n int; v int;
begin
  insert into organizations(id,name,created_by) values (o,'TESTE-ROLLBACK',ow),(o2,'TESTE-ROLLBACK-ALHEIA',fx);
  insert into org_members(org_id,user_id,role) values (o,ow,'owner'),(o,ed,'editor'),(o,vw,'viewer'),(o2,fx,'owner');
  insert into official_data(org_id) values (o),(o2);
  x := commit_official(o,ed,'e@t',0,'{"a":1}'::jsonb,rq,'s','[{"id":"1"}]'::jsonb); r := r||' editor_1a='||(x->>'status')||':'||(x->>'version');
  -- mesmo request_id e mesmo pacote (retry/duplo clique/resposta perdida): não grava de novo
  x := commit_official(o,ed,'e@t',0,'{"a":1}'::jsonb,rq,'s','[{"id":"1"}]'::jsonb); r := r||' mesmo_request='||(x->>'status')||':'||(x->>'version');
  -- mesmo request_id com versão esperada já avançada: continua duplicate (não conflito, não grava)
  x := commit_official(o,ed,'e@t',1,'{"a":2}'::jsonb,rq,'s','[]'::jsonb); r := r||' mesmo_request_outra_versao='||(x->>'status');
  select version into v from official_data where org_id=o; r := r||' versao_final='||v;
  select count(*) into n from audit_log where request_id=rq; r := r||' auditorias_do_request='||n;
  x := commit_official(o,ow,'o@t',0,'{"a":3}'::jsonb,gen_random_uuid(),'s','[]'::jsonb); r := r||' versao_antiga='||(x->>'status');
  x := commit_official(o,vw,'v@t',1,'{"a":4}'::jsonb,gen_random_uuid(),'s','[]'::jsonb); r := r||' leitor_grava='||(x->>'status');
  x := commit_official(o,fx,'f@t',1,'{"a":5}'::jsonb,gen_random_uuid(),'s','[]'::jsonb); r := r||' org_alheia_grava='||(x->>'status');
  r := r||' dado_final='||(select data->>'a' from official_data where org_id=o)||' auditorias_org='||(select count(*) from audit_log where org_id=o);
  -- RLS de leitura como usuário autenticado
  perform set_config('request.jwt.claims', json_build_object('sub',vw,'role','authenticated')::text, true);
  perform set_config('role','authenticated',true);
  select count(*) into n from official_data where org_id=o; r := r||' leitor_le_propria='||n;
  select count(*) into n from official_data where org_id=o2; r := r||' leitor_le_alheia='||n;
  select count(*) into n from audit_log where org_id=o2; r := r||' leitor_le_auditoria_alheia='||n;
  perform set_config('request.jwt.claims', json_build_object('sub',fx,'role','authenticated')::text, true);
  select count(*) into n from official_data where org_id=o; r := r||' estranho_le='||n;
  select count(*) into n from audit_log where org_id=o; r := r||' estranho_le_auditoria='||n;
  raise exception 'RESULTADO:%', r;
end $$;
