-- Teste isolado de autorização (org fictícias; termina com RAISE => rollback total, nada persiste).
-- Esperado: owner=ok viewer=forbidden outsider=forbidden staleVersion=conflict outsiderReadsA=0 viewerReadsA=1 viewerReadsB=0
do $$
declare oa uuid := gen_random_uuid(); ob uuid := gen_random_uuid();
 owner uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
 r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; seen_out int; seen_view int; seen_view_b int; ver int; acc text;
 doc jsonb := '{"bankAccounts":[{"id":"A","bank":"Ficticio","label":"Teste","active":true}],"transfers":[]}';
begin
 insert into public.organizations(id,name,created_by) values (oa,'__teste_A',owner),(ob,'__teste_B',outsider);
 insert into public.org_members(org_id,user_id,role) values (oa,owner,'owner'),(oa,viewer,'viewer'),(ob,outsider,'owner');
 insert into public.official_data(org_id,data) values (oa,'{}'),(ob,'{}');
 r1 := public.commit_official(oa, owner, 'o@x', 0, doc, gen_random_uuid(), 't', '[]');
 r2 := public.commit_official(oa, viewer, 'v@x', 1, doc, gen_random_uuid(), 't', '[]');
 r3 := public.commit_official(oa, outsider, 'x@x', 1, doc, gen_random_uuid(), 't', '[]');
 r4 := public.commit_official(oa, owner, 'o@x', 0, doc, gen_random_uuid(), 't', '[]');
 select version, data->'bankAccounts'->0->>'bank' into ver, acc from public.official_data where org_id=oa;
 perform set_config('role','authenticated',true);
 perform set_config('request.jwt.claims', json_build_object('sub',outsider,'role','authenticated')::text, true);
 select count(*) into seen_out from public.official_data where org_id=oa;
 perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
 select count(*) into seen_view from public.official_data where org_id=oa;
 select count(*) into seen_view_b from public.official_data where org_id=ob;
 raise exception 'RESULT owner=% viewer=% outsider=% staleVersion=% version=% bank=% outsiderReadsA=% viewerReadsA=% viewerReadsB=%', r1->>'status', r2->>'status', r3->>'status', r4->>'status', ver, acc, seen_out, seen_view, seen_view_b;
end $$;
