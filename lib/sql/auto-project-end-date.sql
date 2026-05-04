-- ============================================================================
-- HYDRACODE — TERMINO REAL DO PROJETO (PREENCHIMENTO AUTOMATICO)
-- ============================================================================
-- Objetivo:
--   Sempre que todas as tarefas de um projeto forem colocadas em "completed",
--   o campo public.projects.actual_end_date e preenchido automaticamente com
--   a maior data de conclusao das tarefas.
--   Se uma tarefa for reaberta (status != completed) ou nova tarefa pendente
--   for adicionada, o campo e limpo (NULL) ate que todas estejam concluidas.
--
-- Idempotente. Pode rodar varias vezes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_project_actual_end_date(p_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_completed INT;
  v_max_end DATE;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total, v_completed
  FROM public.tasks
  WHERE project_id = p_project_id;

  IF v_total > 0 AND v_completed = v_total THEN
    -- Pega a maior data efetiva de conclusao entre as tarefas
    SELECT GREATEST(
      MAX(actual_completed_date),
      MAX(COALESCE(completed_at::date, '0001-01-01'::date))
    )
    INTO v_max_end
    FROM public.tasks
    WHERE project_id = p_project_id;

    IF v_max_end IS NULL OR v_max_end = '0001-01-01'::date THEN
      v_max_end := CURRENT_DATE;
    END IF;

    UPDATE public.projects
    SET actual_end_date = v_max_end
    WHERE id = p_project_id
      AND (actual_end_date IS DISTINCT FROM v_max_end);
  ELSE
    UPDATE public.projects
    SET actual_end_date = NULL
    WHERE id = p_project_id
      AND actual_end_date IS NOT NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recalc_project_actual_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_project_actual_end_date(OLD.project_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalc_project_actual_end_date(NEW.project_id);

  -- Se o projeto da tarefa mudou (movimentacao entre projetos), recalcula o antigo.
  IF TG_OP = 'UPDATE'
     AND NEW.project_id IS DISTINCT FROM OLD.project_id
     AND OLD.project_id IS NOT NULL THEN
    PERFORM public.recalc_project_actual_end_date(OLD.project_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_project_actual_end_date ON public.tasks;

CREATE TRIGGER trg_recalc_project_actual_end_date
AFTER INSERT OR UPDATE OF status, actual_completed_date, completed_at, project_id
              OR DELETE
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tg_recalc_project_actual_end_date();

-- ─── BACKFILL — recalcula todos os projetos existentes ────────────────────

DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.projects LOOP
    PERFORM public.recalc_project_actual_end_date(v_id);
  END LOOP;
END
$$;
