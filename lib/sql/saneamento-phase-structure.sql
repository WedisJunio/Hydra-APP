-- ============================================================================
-- HYDRACODE — ESTRUTURA HIERÁRQUICA DE FASES (Saneamento)
-- ============================================================================
-- Objetivo:
-- Fase -> Título/Categoria -> Subtítulo (SAA/SES/...) -> Tarefas
-- + campos técnicos extras em tasks para gestão completa.
-- ============================================================================

-- ─── 1. Títulos dentro da fase ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_phase_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES public.project_phases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_phase_titles_phase_idx
  ON public.project_phase_titles(phase_id);

-- ─── 2. Subtítulos dentro do título ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_phase_subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id UUID NOT NULL REFERENCES public.project_phase_titles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  system_type TEXT CHECK (system_type IS NULL OR system_type IN (
    'SAA',
    'SES',
    'DRENAGEM',
    'ETA',
    'ETE',
    'ELEVATORIA',
    'OUTRO'
  )),
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_phase_subtitles_title_idx
  ON public.project_phase_subtitles(title_id);

-- ─── 3. Campos extras em tarefas ─────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS title_id UUID REFERENCES public.project_phase_titles(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS subtitle_id UUID REFERENCES public.project_phase_subtitles(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority TEXT
  CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_date DATE;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completion_date DATE;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS comments TEXT;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS phase_task_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS tasks_title_idx ON public.tasks(title_id);
CREATE INDEX IF NOT EXISTS tasks_subtitle_idx ON public.tasks(subtitle_id);
CREATE INDEX IF NOT EXISTS tasks_phase_order_idx ON public.tasks(project_id, phase_id, phase_task_order);

-- ─── 4. RLS para novas tabelas ───────────────────────────────────────────────

ALTER TABLE public.project_phase_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phase_subtitles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_phase_titles_select ON public.project_phase_titles;
DROP POLICY IF EXISTS project_phase_titles_insert ON public.project_phase_titles;
DROP POLICY IF EXISTS project_phase_titles_update ON public.project_phase_titles;
DROP POLICY IF EXISTS project_phase_titles_delete ON public.project_phase_titles;

CREATE POLICY project_phase_titles_select ON public.project_phase_titles
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phases pp
      WHERE pp.id = phase_id
      AND public.is_project_member(pp.project_id)
    )
  );

CREATE POLICY project_phase_titles_insert ON public.project_phase_titles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phases pp
      WHERE pp.id = phase_id
      AND public.is_project_lead(pp.project_id)
    )
  );

CREATE POLICY project_phase_titles_update ON public.project_phase_titles
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phases pp
      WHERE pp.id = phase_id
      AND public.is_project_lead(pp.project_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phases pp
      WHERE pp.id = phase_id
      AND public.is_project_lead(pp.project_id)
    )
  );

CREATE POLICY project_phase_titles_delete ON public.project_phase_titles
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phases pp
      WHERE pp.id = phase_id
      AND public.is_project_lead(pp.project_id)
    )
  );

DROP POLICY IF EXISTS project_phase_subtitles_select ON public.project_phase_subtitles;
DROP POLICY IF EXISTS project_phase_subtitles_insert ON public.project_phase_subtitles;
DROP POLICY IF EXISTS project_phase_subtitles_update ON public.project_phase_subtitles;
DROP POLICY IF EXISTS project_phase_subtitles_delete ON public.project_phase_subtitles;

CREATE POLICY project_phase_subtitles_select ON public.project_phase_subtitles
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phase_titles ppt
      JOIN public.project_phases pp ON pp.id = ppt.phase_id
      WHERE ppt.id = title_id
      AND public.is_project_member(pp.project_id)
    )
  );

CREATE POLICY project_phase_subtitles_insert ON public.project_phase_subtitles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phase_titles ppt
      JOIN public.project_phases pp ON pp.id = ppt.phase_id
      WHERE ppt.id = title_id
      AND public.is_project_lead(pp.project_id)
    )
  );

CREATE POLICY project_phase_subtitles_update ON public.project_phase_subtitles
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phase_titles ppt
      JOIN public.project_phases pp ON pp.id = ppt.phase_id
      WHERE ppt.id = title_id
      AND public.is_project_lead(pp.project_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phase_titles ppt
      JOIN public.project_phases pp ON pp.id = ppt.phase_id
      WHERE ppt.id = title_id
      AND public.is_project_lead(pp.project_id)
    )
  );

CREATE POLICY project_phase_subtitles_delete ON public.project_phase_subtitles
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_phase_titles ppt
      JOIN public.project_phases pp ON pp.id = ppt.phase_id
      WHERE ppt.id = title_id
      AND public.is_project_lead(pp.project_id)
    )
  );
