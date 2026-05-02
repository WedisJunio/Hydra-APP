-- ============================================================================
-- HYDRACODE — VINCULAR TAREFAS A ETAPAS (saneamento)
-- ============================================================================
-- Adiciona uma coluna OPCIONAL "phase_id" em public.tasks, permitindo que
-- cada tarefa fique associada a uma etapa específica do projeto
-- (ex.: Estudo de Concepção, Projeto Básico, Projeto Executivo, etc.).
--
-- - Tarefas existentes ficam com phase_id = NULL (sem etapa) e continuam
--   funcionando normalmente.
-- - Se a etapa for excluída, a tarefa não some — apenas perde o vínculo
--   (ON DELETE SET NULL).
--
-- COMO USAR:
-- 1. Abrir Supabase Studio → SQL Editor → New query
-- 2. Colar o SQL abaixo e clicar Run
-- ============================================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS phase_id UUID
  REFERENCES public.project_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_phase_idx ON public.tasks (phase_id);
