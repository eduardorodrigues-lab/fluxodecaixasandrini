-- Somente para o banco isolado de teste: reproduz o mínimo do esquema existente em produção.
CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.org_members (org_id uuid NOT NULL REFERENCES public.organizations(id), user_id uuid NOT NULL, role text NOT NULL, PRIMARY KEY (org_id, user_id));
CREATE FUNCTION public.is_org_member(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM org_members WHERE org_id = _org AND user_id = auth.uid()) $$;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
