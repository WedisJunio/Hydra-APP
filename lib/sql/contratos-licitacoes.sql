-- ============================================================================
-- HYDRACODE — Contratos & Licitações (atestados, CATs, profissionais, licitações)
-- ============================================================================
-- Rode no Supabase SQL Editor após public.users e helpers de permissions.sql
-- (current_app_user_id, has_full_portfolio_access, etc.).
-- ============================================================================

-- Profissionais da base de contratos (podem ou não espelhar public.users)
CREATE TABLE IF NOT EXISTS public.contract_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  job_title text,
  education text,
  crea_number text,
  crea_state text,
  specialty text,
  company_relation text,
  availability text NOT NULL DEFAULT 'disponivel'
    CHECK (availability IN ('disponivel', 'parcial', 'indisponivel')),
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'inativo')),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_cats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_number text NOT NULL,
  council text,
  state text,
  professional_id uuid REFERENCES public.contract_professionals(id) ON DELETE SET NULL,
  company_name text,
  related_contract_ref text,
  technical_object text,
  activity_type text,
  service_type text,
  issue_date date,
  pdf_url text,
  status text NOT NULL DEFAULT 'valida'
    CHECK (status IN ('valida', 'pendente', 'vencida', 'sem_arquivo')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contract_cats_cat_council_state_uidx
  ON public.contract_cats (
    lower(trim(cat_number)),
    lower(trim(coalesce(council, ''))),
    lower(trim(coalesce(state, '')))
  );

CREATE TABLE IF NOT EXISTS public.contract_atestados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  holder_company text,
  client_org text,
  city text,
  state text,
  contract_number text,
  contract_object text,
  services_description text,
  service_type text,
  technical_area text,
  issue_date date,
  execution_start date,
  execution_end date,
  contract_value numeric,
  technical_responsible text,
  cat_id uuid REFERENCES public.contract_cats(id) ON DELETE SET NULL,
  pdf_url text,
  cat_pdf_url text,
  doc_status text NOT NULL DEFAULT 'ok'
    CHECK (doc_status IN ('ok', 'pendente', 'vencido', 'sem_arquivo')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_atestado_professionals (
  atestado_id uuid NOT NULL REFERENCES public.contract_atestados(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.contract_professionals(id) ON DELETE CASCADE,
  PRIMARY KEY (atestado_id, professional_id)
);

CREATE TABLE IF NOT EXISTS public.contract_licitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  org_name text,
  city text,
  state text,
  edital_number text,
  modality text,
  object_text text,
  published_at date,
  proposal_deadline timestamptz,
  session_date date,
  estimated_value numeric,
  status text NOT NULL DEFAULT 'em_analise'
    CHECK (status IN (
      'em_analise',
      'aguardando_documentos',
      'equipe_pendente',
      'atestados_pendentes',
      'pronta_participar',
      'participando',
      'vencida',
      'perdida',
      'cancelada',
      'concluida'
    )),
  internal_responsible_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  requirements_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_licitacao_members (
  licitacao_id uuid NOT NULL REFERENCES public.contract_licitacoes(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.contract_professionals(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'integrante',
  PRIMARY KEY (licitacao_id, professional_id)
);

CREATE TABLE IF NOT EXISTS public.contract_licitacao_atestados (
  licitacao_id uuid NOT NULL REFERENCES public.contract_licitacoes(id) ON DELETE CASCADE,
  atestado_id uuid NOT NULL REFERENCES public.contract_atestados(id) ON DELETE CASCADE,
  PRIMARY KEY (licitacao_id, atestado_id)
);

CREATE TABLE IF NOT EXISTS public.contract_licitacao_cats (
  licitacao_id uuid NOT NULL REFERENCES public.contract_licitacoes(id) ON DELETE CASCADE,
  cat_id uuid NOT NULL REFERENCES public.contract_cats(id) ON DELETE CASCADE,
  PRIMARY KEY (licitacao_id, cat_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_atestados_service ON public.contract_atestados(service_type);
CREATE INDEX IF NOT EXISTS idx_contract_atestados_city ON public.contract_atestados(city, state);
CREATE INDEX IF NOT EXISTS idx_contract_licitacoes_status ON public.contract_licitacoes(status);
CREATE INDEX IF NOT EXISTS idx_contract_licitacoes_deadline ON public.contract_licitacoes(proposal_deadline);

-- RLS
ALTER TABLE public.contract_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_cats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_atestados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_atestado_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_licitacao_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_licitacao_atestados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_licitacao_cats ENABLE ROW LEVEL SECURITY;

-- Leitura: equipe autenticada
-- Escrita: quem tem acesso amplo ao portfólio (coordenação+, gestão)

DROP POLICY IF EXISTS contract_professionals_select ON public.contract_professionals;
CREATE POLICY contract_professionals_select ON public.contract_professionals
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contract_professionals_mutate ON public.contract_professionals;
CREATE POLICY contract_professionals_mutate ON public.contract_professionals
  FOR ALL TO authenticated
  USING (public.has_full_portfolio_access())
  WITH CHECK (public.has_full_portfolio_access());

DROP POLICY IF EXISTS contract_cats_select ON public.contract_cats;
CREATE POLICY contract_cats_select ON public.contract_cats
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contract_cats_mutate ON public.contract_cats;
CREATE POLICY contract_cats_mutate ON public.contract_cats
  FOR ALL TO authenticated
  USING (public.has_full_portfolio_access())
  WITH CHECK (public.has_full_portfolio_access());

DROP POLICY IF EXISTS contract_atestados_select ON public.contract_atestados;
CREATE POLICY contract_atestados_select ON public.contract_atestados
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contract_atestados_mutate ON public.contract_atestados;
CREATE POLICY contract_atestados_mutate ON public.contract_atestados
  FOR ALL TO authenticated
  USING (public.has_full_portfolio_access())
  WITH CHECK (public.has_full_portfolio_access());

DROP POLICY IF EXISTS contract_atestado_professionals_select ON public.contract_atestado_professionals;
CREATE POLICY contract_atestado_professionals_select ON public.contract_atestado_professionals
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contract_atestado_professionals_mutate ON public.contract_atestado_professionals;
CREATE POLICY contract_atestado_professionals_mutate ON public.contract_atestado_professionals
  FOR ALL TO authenticated
  USING (public.has_full_portfolio_access())
  WITH CHECK (public.has_full_portfolio_access());

DROP POLICY IF EXISTS contract_licitacoes_select ON public.contract_licitacoes;
CREATE POLICY contract_licitacoes_select ON public.contract_licitacoes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contract_licitacoes_mutate ON public.contract_licitacoes;
CREATE POLICY contract_licitacoes_mutate ON public.contract_licitacoes
  FOR ALL TO authenticated
  USING (public.has_full_portfolio_access())
  WITH CHECK (public.has_full_portfolio_access());

DROP POLICY IF EXISTS contract_licitacao_members_select ON public.contract_licitacao_members;
CREATE POLICY contract_licitacao_members_select ON public.contract_licitacao_members
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contract_licitacao_members_mutate ON public.contract_licitacao_members;
CREATE POLICY contract_licitacao_members_mutate ON public.contract_licitacao_members
  FOR ALL TO authenticated
  USING (public.has_full_portfolio_access())
  WITH CHECK (public.has_full_portfolio_access());

DROP POLICY IF EXISTS contract_licitacao_atestados_select ON public.contract_licitacao_atestados;
CREATE POLICY contract_licitacao_atestados_select ON public.contract_licitacao_atestados
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contract_licitacao_atestados_mutate ON public.contract_licitacao_atestados;
CREATE POLICY contract_licitacao_atestados_mutate ON public.contract_licitacao_atestados
  FOR ALL TO authenticated
  USING (public.has_full_portfolio_access())
  WITH CHECK (public.has_full_portfolio_access());

DROP POLICY IF EXISTS contract_licitacao_cats_select ON public.contract_licitacao_cats;
CREATE POLICY contract_licitacao_cats_select ON public.contract_licitacao_cats
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS contract_licitacao_cats_mutate ON public.contract_licitacao_cats;
CREATE POLICY contract_licitacao_cats_mutate ON public.contract_licitacao_cats
  FOR ALL TO authenticated
  USING (public.has_full_portfolio_access())
  WITH CHECK (public.has_full_portfolio_access());
