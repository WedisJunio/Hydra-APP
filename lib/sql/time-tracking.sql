-- ============================================================================
-- HYDRACODE — SISTEMA DE PONTO (time_entries)
-- ============================================================================
-- Modelo simples: cada batida é uma linha com clock_in (obrigatório) e
-- clock_out (NULL enquanto o expediente está aberto).
-- Apenas UMA linha aberta por usuário por vez.
--
-- COMO USAR:
-- 1. Rode antes o lib/sql/permissions.sql (helpers: current_app_user_id, has_full_portfolio_access, is_admin)
-- 2. Cole este arquivo no Supabase Studio → SQL Editor → Run
--
-- IDEMPOTENTE: pode rodar várias vezes.
-- ============================================================================

-- ─── 1. TABELA ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  clock_in    TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out   TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_entries_clock_out_after_in
    CHECK (clock_out IS NULL OR clock_out >= clock_in)
);

-- ─── 2. ÍNDICES ─────────────────────────────────────────────────────────────
-- Apenas UM expediente aberto por usuário.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_open_per_user
  ON public.time_entries (user_id)
  WHERE clock_out IS NULL;

-- Listagem cronológica por usuário.
CREATE INDEX IF NOT EXISTS time_entries_user_clock_in_idx
  ON public.time_entries (user_id, clock_in DESC);

-- Para relatórios mensais (filtro por período sem usuário).
CREATE INDEX IF NOT EXISTS time_entries_clock_in_idx
  ON public.time_entries (clock_in DESC);

-- ─── 3. TRIGGER updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.time_entries_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_entries_updated_at ON public.time_entries;
CREATE TRIGGER time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.time_entries_set_updated_at();

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas (idempotência).
DROP POLICY IF EXISTS "time_entries: select own or admin"
  ON public.time_entries;
DROP POLICY IF EXISTS "time_entries: insert own"
  ON public.time_entries;
DROP POLICY IF EXISTS "time_entries: update own or admin"
  ON public.time_entries;
DROP POLICY IF EXISTS "time_entries: delete own or admin"
  ON public.time_entries;

-- SELECT: o próprio usuário vê suas batidas; perfis com portfólio completo veem todas.
CREATE POLICY "time_entries: select own or admin"
  ON public.time_entries
  FOR SELECT
  USING (
    user_id = public.current_app_user_id()
    OR public.has_full_portfolio_access()
  );

-- INSERT: usuário só pode inserir batida pra si mesmo (admin pode pra qualquer um).
CREATE POLICY "time_entries: insert own"
  ON public.time_entries
  FOR INSERT
  WITH CHECK (
    user_id = public.current_app_user_id()
    OR public.is_admin()
  );

-- UPDATE: própria batida; admin ou portfólio completo podem ajustar.
CREATE POLICY "time_entries: update own or admin"
  ON public.time_entries
  FOR UPDATE
  USING (
    user_id = public.current_app_user_id()
    OR public.has_full_portfolio_access()
  )
  WITH CHECK (
    user_id = public.current_app_user_id()
    OR public.has_full_portfolio_access()
  );

-- DELETE: própria; admin ou portfólio completo.
CREATE POLICY "time_entries: delete own or admin"
  ON public.time_entries
  FOR DELETE
  USING (
    user_id = public.current_app_user_id()
    OR public.has_full_portfolio_access()
  );

-- ─── 5. VIEW DE RESUMO (opcional, para relatórios) ──────────────────────────
-- Soma a duração das batidas fechadas + entrada aberta atual.
CREATE OR REPLACE VIEW public.time_entries_with_duration AS
SELECT
  te.*,
  EXTRACT(EPOCH FROM (COALESCE(te.clock_out, now()) - te.clock_in))::INT
    AS duration_seconds,
  (te.clock_out IS NULL) AS is_open
FROM public.time_entries te;

-- A view herda RLS da tabela base, então não precisa de policy própria.
