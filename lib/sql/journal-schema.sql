-- ============================================================================
-- HYDRACODE — DIÁRIO DE PROJETO (saneamento)
-- ============================================================================
-- Tabela project_journal_entries: registros datados do que aconteceu no
-- projeto a cada dia. Cada entrada é vinculada a:
--   - um projeto (obrigatório)
--   - um autor (usuário)
--   - uma data (entry_date — pode ser anterior ao dia em que foi escrita)
--   - opcionalmente: uma tarefa específica e/ou uma etapa
--
-- Categorias suportadas:
--   progresso     — avanço técnico
--   bloqueio      — algo travando (espera de dado, dependência externa)
--   diligencia    — exigência da concessionária / órgão
--   reuniao       — reunião com cliente, equipe, órgão
--   visita        — visita técnica em campo
--   comunicacao   — e-mail / telefonema / ofício
--   outro         — geral
--
-- COMO USAR:
-- 1. Garante que saneamento-schema.sql + permissions.sql já rodaram
-- 2. Abre Supabase Studio → SQL Editor → New query
-- 3. Cola este arquivo inteiro e roda
-- ============================================================================


-- ─── 1. TABELA ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_journal_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    task_id         UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    phase_id        UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
    author_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
    entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    category        TEXT NOT NULL DEFAULT 'outro'
                    CHECK (category IN (
                      'progresso',
                      'bloqueio',
                      'diligencia',
                      'reuniao',
                      'visita',
                      'comunicacao',
                      'outro'
                    )),
    title           TEXT,
    content         TEXT NOT NULL,
    hours_worked    NUMERIC,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_project_idx  ON public.project_journal_entries (project_id);
CREATE INDEX IF NOT EXISTS journal_date_idx     ON public.project_journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_author_idx   ON public.project_journal_entries (author_id);
CREATE INDEX IF NOT EXISTS journal_category_idx ON public.project_journal_entries (category);


-- ─── 2. RLS — POLICIES ──────────────────────────────────────────────────────
-- Usa as helper functions que já existem em permissions.sql:
--   - is_admin(), is_project_member(uuid), is_project_lead(uuid),
--     current_app_user_id()

ALTER TABLE public.project_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_select ON public.project_journal_entries;
DROP POLICY IF EXISTS journal_insert ON public.project_journal_entries;
DROP POLICY IF EXISTS journal_update ON public.project_journal_entries;
DROP POLICY IF EXISTS journal_delete ON public.project_journal_entries;

-- Quem pode VER: admin OU membro do projeto.
CREATE POLICY journal_select ON public.project_journal_entries
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR public.is_project_member(project_id)
  );

-- Quem pode CRIAR: membro do projeto, e o author_id deve ser ele mesmo.
CREATE POLICY journal_insert ON public.project_journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_admin() OR public.is_project_member(project_id))
    AND author_id = public.current_app_user_id()
  );

-- Quem pode EDITAR: admin, autor da entrada, ou líder do projeto.
CREATE POLICY journal_update ON public.project_journal_entries
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR author_id = public.current_app_user_id()
    OR public.is_project_lead(project_id)
  )
  WITH CHECK (
    public.is_admin()
    OR author_id = public.current_app_user_id()
    OR public.is_project_lead(project_id)
  );

-- Quem pode EXCLUIR: admin, autor da entrada, ou líder do projeto.
CREATE POLICY journal_delete ON public.project_journal_entries
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR author_id = public.current_app_user_id()
    OR public.is_project_lead(project_id)
  );

-- ============================================================================
-- FIM
-- ============================================================================
