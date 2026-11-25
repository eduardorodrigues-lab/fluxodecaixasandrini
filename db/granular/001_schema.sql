-- Persistência granular do fluxo financeiro — ARTEFATO PARA APROVAÇÃO. NÃO APLICADO no banco do projeto.
-- Testado somente em banco isolado (PGlite) por src/lib/granular/granular.test.ts.
-- Pré-requisitos já existentes em produção: public.organizations, public.org_members(org_id,user_id,role), public.is_org_member(uuid).
-- Protocolo: as mesmas alterações por registro (entity,id,before,after) já usadas por commitOps; cada registro é uma linha.

CREATE SEQUENCE IF NOT EXISTS public.fin_seq;

-- Estado por organização: modo de operação (feature flag do corte) e versão de origem da carga.
CREATE TABLE public.fin_org_state (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  mode text NOT NULL DEFAULT 'document' CHECK (mode IN ('document','granular','frozen')),
  imported_version integer,
  imported_at timestamptz,
  imported_digest text
);

-- Uma tabela por entidade, mesmo formato: corpo integral do registro (nenhum campo reduzido), versão por registro,
-- posição original (ord) e sequência de alteração (changed_seq) para leitura incremental. Exclusão vira marca (deleted).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin_suppliers','fin_categories','fin_planned','fin_committed','fin_expenses','fin_effectivations',
    'fin_payments','fin_receipts','fin_bank_accounts','fin_cards','fin_card_ops','fin_transfers','fin_adjustments','fin_import_log',
    'fin_targets','fin_target_configs','fin_params','fin_platforms'] LOOP
    EXECUTE format($f$
      CREATE TABLE public.%1$I (
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        id text NOT NULL,
        ord bigint NOT NULL,
        body jsonb,
        version integer NOT NULL DEFAULT 1,
        changed_seq bigint NOT NULL,
        deleted boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid,
        PRIMARY KEY (org_id, id)
      );
      CREATE INDEX %1$s_seq ON public.%1$I (org_id, changed_seq);
      GRANT SELECT ON public.%1$I TO authenticated;
      GRANT ALL ON public.%1$I TO service_role;
      ALTER TABLE public.%1$I ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "membros leem" ON public.%1$I FOR SELECT TO authenticated USING (public.is_org_member(org_id));
    $f$, t);
  END LOOP;
END $$;

-- Colunas derivadas (somente leitura) para o fluxo por data, fornecedor e vínculos.
ALTER TABLE public.fin_committed ADD COLUMN supplier_id text GENERATED ALWAYS AS (body->>'supplierId') STORED,
  ADD COLUMN planned_id text GENERATED ALWAYS AS (body->>'plannedId') STORED,
  ADD COLUMN due text GENERATED ALWAYS AS (coalesce(body->>'extensionDate', body->>'dueDate')) STORED,
  ADD COLUMN status text GENERATED ALWAYS AS (body->>'status') STORED;
CREATE INDEX fin_committed_due ON public.fin_committed (org_id, due) WHERE NOT deleted;
CREATE INDEX fin_committed_supplier ON public.fin_committed (org_id, supplier_id) WHERE NOT deleted;
CREATE INDEX fin_committed_planned ON public.fin_committed (org_id, planned_id) WHERE NOT deleted;
ALTER TABLE public.fin_planned ADD COLUMN supplier_id text GENERATED ALWAYS AS (body->>'supplierId') STORED,
  ADD COLUMN base_date text GENERATED ALWAYS AS (body->>'baseDate') STORED;
CREATE INDEX fin_planned_base ON public.fin_planned (org_id, base_date) WHERE NOT deleted;
ALTER TABLE public.fin_expenses ADD COLUMN supplier_id text GENERATED ALWAYS AS (body->>'supplierId') STORED,
  ADD COLUMN due text GENERATED ALWAYS AS (coalesce(body->>'extensionDate', body->>'dueDate', body->>'baseDate')) STORED;
CREATE INDEX fin_expenses_due ON public.fin_expenses (org_id, due) WHERE NOT deleted;
ALTER TABLE public.fin_payments ADD COLUMN title_id text GENERATED ALWAYS AS (body->>'titleId') STORED,
  ADD COLUMN pay_date text GENERATED ALWAYS AS (body->>'date') STORED;
CREATE INDEX fin_payments_title ON public.fin_payments (org_id, title_id) WHERE NOT deleted;
CREATE INDEX fin_payments_date ON public.fin_payments (org_id, pay_date) WHERE NOT deleted;
ALTER TABLE public.fin_receipts ADD COLUMN receipt_date text GENERATED ALWAYS AS (body->>'date') STORED;
CREATE INDEX fin_receipts_date ON public.fin_receipts (org_id, receipt_date) WHERE NOT deleted;

-- Registro de operações: unicidade org+requestId com identidade do conteúdo; resposta guardada para reconhecer resposta perdida.
CREATE TABLE public.fin_operations (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  request_id uuid NOT NULL,
  payload_digest text NOT NULL,
  actor uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('committed','conflict')),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, request_id)
);
GRANT SELECT ON public.fin_operations TO authenticated;
GRANT ALL ON public.fin_operations TO service_role;
ALTER TABLE public.fin_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros leem operações" ON public.fin_operations FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- Auditoria granular: um evento por registro alterado, na mesma transação da alteração.
CREATE TABLE public.fin_audit (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  request_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  actor uuid NOT NULL,
  actor_email text,
  entity text NOT NULL,
  record_id text NOT NULL,
  kind text NOT NULL,
  fields text[] NOT NULL DEFAULT '{}',
  before jsonb,
  after jsonb,
  seq bigint NOT NULL
);
CREATE INDEX fin_audit_record ON public.fin_audit (org_id, entity, record_id, at);
CREATE INDEX fin_audit_time ON public.fin_audit (org_id, at DESC);
GRANT SELECT ON public.fin_audit TO authenticated;
GRANT ALL ON public.fin_audit TO service_role;
ALTER TABLE public.fin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros leem auditoria granular" ON public.fin_audit FOR SELECT TO authenticated USING (public.is_org_member(org_id));

-- Rótulo da alteração → tabela (mesmos rótulos de src/lib/diff.ts).
CREATE OR REPLACE FUNCTION public.fin_table(_entity text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _entity
    WHEN 'Fornecedor' THEN 'fin_suppliers' WHEN 'Categoria' THEN 'fin_categories'
    WHEN 'Previsão (planejada)' THEN 'fin_planned' WHEN 'Efetivado (compra/pedido)' THEN 'fin_committed'
    WHEN 'Despesa' THEN 'fin_expenses' WHEN 'Efetivação' THEN 'fin_effectivations'
    WHEN 'Pagamento (baixa)' THEN 'fin_payments' WHEN 'Recebimento' THEN 'fin_receipts'
    WHEN 'Conta bancária' THEN 'fin_bank_accounts' WHEN 'Cartão' THEN 'fin_cards'
    WHEN 'Operação no cartão' THEN 'fin_card_ops' WHEN 'Transferência' THEN 'fin_transfers'
    WHEN 'Ajuste de saldo' THEN 'fin_adjustments' WHEN 'Registro de importação' THEN 'fin_import_log'
    WHEN 'Meta de faturamento' THEN 'fin_targets' WHEN 'Configuração financeira mensal' THEN 'fin_target_configs'
    WHEN 'Parâmetros' THEN 'fin_params' WHEN 'Plataformas' THEN 'fin_platforms' END
$$;

-- Lê/grava um registro (linha bloqueada até o fim da transação).
CREATE OR REPLACE FUNCTION public.fin_get(_t text, _org uuid, _id text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE b jsonb;
BEGIN
  EXECUTE format('SELECT body FROM public.%I WHERE org_id=$1 AND id=$2 AND NOT deleted FOR UPDATE', _t) INTO b USING _org, _id;
  RETURN b;
END $$;
CREATE OR REPLACE FUNCTION public.fin_put(_t text, _org uuid, _id text, _body jsonb, _seq bigint, _actor uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
  EXECUTE format($q$
    INSERT INTO public.%1$I AS r (org_id,id,ord,body,changed_seq,deleted,updated_by)
    VALUES ($1,$2,(SELECT coalesce(max(ord),0)+1 FROM public.%1$I WHERE org_id=$1),$3,$4,$3 IS NULL,$5)
    ON CONFLICT (org_id,id) DO UPDATE SET body=$3, deleted=$3 IS NULL, version=r.version+1, changed_seq=$4, updated_at=now(), updated_by=$5
    RETURNING version$q$, _t) INTO v USING _org, _id, _body, _seq, _actor;
  RETURN v;
END $$;

-- Gravação: autorização + idempotência + conferência de "antes"/dependências + alteração + auditoria, numa transação.
-- Registros independentes não se bloqueiam (sem trava por organização); o mesmo registro é serializado pela trava de linha.
CREATE OR REPLACE FUNCTION public.fin_commit(_org uuid, _actor uuid, _email text, _request uuid, _digest text, _ops jsonb, _deps jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prev record; op jsonb; dep jsonb; t text; cur jsonb; bef jsonb; aft jsonb; k text; s bigint; v integer;
  conflicts jsonb := '[]'; applied jsonb := '[]'; res jsonb; mode text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_members WHERE org_id=_org AND user_id=_actor AND role IN ('owner','editor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT o.mode INTO mode FROM fin_org_state o WHERE o.org_id=_org;
  IF mode IS DISTINCT FROM 'granular' THEN RAISE EXCEPTION 'granular_disabled'; END IF;
  -- Mesma identificação: devolve a resposta original; conteúdo diferente com a mesma identificação é recusado.
  SELECT * INTO prev FROM fin_operations WHERE org_id=_org AND request_id=_request;
  IF FOUND THEN
    IF prev.payload_digest <> _digest THEN RAISE EXCEPTION 'payload_mismatch'; END IF;
    RETURN prev.result || jsonb_build_object('replayed', true);
  END IF;
  INSERT INTO fin_operations(org_id,request_id,payload_digest,actor,status,result) VALUES (_org,_request,_digest,_actor,'committed','{}')
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN -- envio simultâneo com a mesma identificação: aguarda o primeiro e devolve a resposta dele
    SELECT * INTO prev FROM fin_operations WHERE org_id=_org AND request_id=_request;
    IF prev.payload_digest <> _digest THEN RAISE EXCEPTION 'payload_mismatch'; END IF;
    RETURN prev.result || jsonb_build_object('replayed', true);
  END IF;
  -- Dependências lidas pelo formulário (fornecedor, condição, conta…) devem continuar iguais.
  FOR dep IN SELECT * FROM jsonb_array_elements(_deps) LOOP
    t := fin_table(dep->>'entity');
    IF t IS NULL THEN CONTINUE; END IF;
    cur := fin_get(t, _org, dep->>'id');
    IF cur IS DISTINCT FROM nullif(dep->'data','null'::jsonb) THEN
      conflicts := conflicts || jsonb_build_object('entity',dep->>'entity','id',dep->>'id','server',cur,'dependency',true);
    END IF;
  END LOOP;
  -- Conferência de todos os registros antes de gravar qualquer um (pacote atômico).
  FOR op IN SELECT * FROM jsonb_array_elements(_ops) LOOP
    t := fin_table(op->>'entity');
    IF t IS NULL THEN RAISE EXCEPTION 'entidade desconhecida: %', op->>'entity'; END IF;
    IF t = 'fin_params' THEN
      FOR k IN SELECT jsonb_object_keys(coalesce(op->'after','{}')) LOOP
        cur := fin_get(t, _org, k); aft := op->'after'->k; bef := op->'before'->k;
        IF cur IS DISTINCT FROM aft AND cur IS DISTINCT FROM bef THEN
          conflicts := conflicts || jsonb_build_object('entity',op->>'entity','id',k,'server',cur);
        END IF;
      END LOOP;
    ELSE
      cur := fin_get(t, _org, op->>'id'); aft := nullif(op->'after','null'::jsonb); bef := nullif(op->'before','null'::jsonb);
      IF cur IS DISTINCT FROM aft AND cur IS DISTINCT FROM bef THEN
        conflicts := conflicts || jsonb_build_object('entity',op->>'entity','id',op->>'id','server',cur);
      END IF;
    END IF;
  END LOOP;
  IF jsonb_array_length(conflicts) > 0 THEN
    res := jsonb_build_object('status','conflict','conflicts',conflicts);
    UPDATE fin_operations SET status='conflict', result=res WHERE org_id=_org AND request_id=_request;
    RETURN res;
  END IF;
  s := nextval('fin_seq');
  FOR op IN SELECT * FROM jsonb_array_elements(_ops) LOOP
    t := fin_table(op->>'entity');
    IF t = 'fin_params' THEN
      FOR k IN SELECT jsonb_object_keys(coalesce(op->'after','{}')) LOOP
        cur := fin_get(t, _org, k); aft := op->'after'->k;
        IF cur IS NOT DISTINCT FROM aft THEN CONTINUE; END IF;
        v := fin_put(t, _org, k, aft, s, _actor);
        INSERT INTO fin_audit(org_id,request_id,actor,actor_email,entity,record_id,kind,fields,before,after,seq)
          VALUES (_org,_request,_actor,_email,op->>'entity',k,'alteração',ARRAY[k],cur,aft,s);
        applied := applied || jsonb_build_object('entity',op->>'entity','id',k,'version',v);
      END LOOP;
    ELSE
      cur := fin_get(t, _org, op->>'id'); aft := nullif(op->'after','null'::jsonb);
      IF cur IS NOT DISTINCT FROM aft THEN CONTINUE; END IF; -- já igual: idempotente
      v := fin_put(t, _org, op->>'id', aft, s, _actor);
      INSERT INTO fin_audit(org_id,request_id,actor,actor_email,entity,record_id,kind,fields,before,after,seq)
        VALUES (_org,_request,_actor,_email,op->>'entity',op->>'id',
          CASE WHEN cur IS NULL THEN 'inclusão' WHEN aft IS NULL THEN 'exclusão' ELSE 'alteração' END,
          coalesce(ARRAY(SELECT jsonb_array_elements_text(op->'fields')), '{}'),cur,aft,s);
      applied := applied || jsonb_build_object('entity',op->>'entity','id',op->>'id','version',v);
    END IF;
  END LOOP;
  res := jsonb_build_object('status','committed','seq',s,'applied',applied);
  UPDATE fin_operations SET result=res WHERE org_id=_org AND request_id=_request;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.fin_commit(uuid,uuid,text,uuid,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_commit(uuid,uuid,text,uuid,text,jsonb,jsonb) TO service_role;

-- Carga inicial a partir do documento oficial (uma vez por organização; recusa se já houver linhas).
CREATE OR REPLACE FUNCTION public.fin_import_document(_org uuid, _doc jsonb, _version integer, _digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; s bigint := nextval('fin_seq'); n bigint := 0; m integer;
BEGIN
  IF EXISTS (SELECT 1 FROM fin_org_state WHERE org_id=_org AND imported_version IS NOT NULL) THEN RAISE EXCEPTION 'already_imported'; END IF;
  FOR c IN SELECT * FROM (VALUES ('suppliers','fin_suppliers','id'),('categories','fin_categories','id'),('planned','fin_planned','id'),
      ('committed','fin_committed','id'),('expenses','fin_expenses','id'),('effectivations','fin_effectivations','id'),('payments','fin_payments','id'),
      ('receipts','fin_receipts','id'),('bankAccounts','fin_bank_accounts','id'),('cards','fin_cards','id'),('cardOps','fin_card_ops','id'),
      ('transfers','fin_transfers','id'),('adjustments','fin_adjustments','date'),('importLog','fin_import_log','key')) v(k,t,idk) LOOP
    EXECUTE format('INSERT INTO public.%I (org_id,id,ord,body,changed_seq) SELECT $1, e->>%L, o, e, $2 FROM jsonb_array_elements(coalesce($3->%L,''[]'')) WITH ORDINALITY x(e,o)', c.t, c.idk, c.k)
      USING _org, s, _doc;
    GET DIAGNOSTICS m = ROW_COUNT; n := n + m;
  END LOOP;
  INSERT INTO fin_targets (org_id,id,ord,body,changed_seq) SELECT _org, key, row_number() over (), value, s FROM jsonb_each(coalesce(_doc->'targets','{}'));
  INSERT INTO fin_target_configs (org_id,id,ord,body,changed_seq) SELECT _org, key, row_number() over (), value, s FROM jsonb_each(coalesce(_doc->'targetConfigs','{}'));
  INSERT INTO fin_params (org_id,id,ord,body,changed_seq) SELECT _org, key, row_number() over (), value, s FROM jsonb_each(coalesce(_doc->'params','{}'));
  INSERT INTO fin_platforms (org_id,id,ord,body,changed_seq) VALUES (_org,'platforms',1,coalesce(_doc->'platforms','[]'),s);
  INSERT INTO fin_org_state(org_id,mode,imported_version,imported_at,imported_digest) VALUES (_org,'frozen',_version,now(),_digest)
    ON CONFLICT (org_id) DO UPDATE SET mode='frozen', imported_version=_version, imported_at=now(), imported_digest=_digest;
  RETURN jsonb_build_object('rows', n, 'seq', s);
END $$;
REVOKE ALL ON FUNCTION public.fin_import_document(uuid,jsonb,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_import_document(uuid,jsonb,integer,text) TO service_role;

-- Documento reconstruído das linhas atuais (conciliação e recuperação: inclui tudo gravado após o corte).
CREATE OR REPLACE FUNCTION public.fin_export_document(_org uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; doc jsonb := '{}'; a jsonb;
BEGIN
  FOR c IN SELECT * FROM (VALUES ('suppliers','fin_suppliers'),('categories','fin_categories'),('planned','fin_planned'),('committed','fin_committed'),
      ('expenses','fin_expenses'),('effectivations','fin_effectivations'),('payments','fin_payments'),('receipts','fin_receipts'),
      ('bankAccounts','fin_bank_accounts'),('cards','fin_cards'),('cardOps','fin_card_ops'),('transfers','fin_transfers'),
      ('adjustments','fin_adjustments'),('importLog','fin_import_log')) v(k,t) LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(body ORDER BY ord, changed_seq), ''[]'') FROM public.%I WHERE org_id=$1 AND NOT deleted', c.t) INTO a USING _org;
    doc := doc || jsonb_build_object(c.k, a);
  END LOOP;
  doc := doc || jsonb_build_object(
    'targets', (SELECT coalesce(jsonb_object_agg(id, body), '{}') FROM fin_targets WHERE org_id=_org AND NOT deleted),
    'targetConfigs', (SELECT coalesce(jsonb_object_agg(id, body), '{}') FROM fin_target_configs WHERE org_id=_org AND NOT deleted),
    'params', (SELECT coalesce(jsonb_object_agg(id, body), '{}') FROM fin_params WHERE org_id=_org AND NOT deleted),
    'platforms', coalesce((SELECT body FROM fin_platforms WHERE org_id=_org AND id='platforms' AND NOT deleted), '[]'));
  RETURN doc;
END $$;
REVOKE ALL ON FUNCTION public.fin_export_document(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_export_document(uuid) TO service_role;
