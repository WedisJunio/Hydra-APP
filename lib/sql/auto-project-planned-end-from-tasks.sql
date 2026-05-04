-- ============================================================================
-- HYDRACODE — PREVISAO DE ENTREGA DO PROJETO A PARTIR DAS TAREFAS
-- ============================================================================
-- Define projects.planned_end_date como a MAIOR planned_due_date entre as
-- tarefas do projeto (prazo agregado da ultima entrega prevista).
-- Se nao houver tarefas com prazo previsto, planned_end_date vira NULL.
--
-- Complementa lib/sql/auto-project-end-date.sql (termino real quando 100%
-- concluido). Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_project_planned_end_date(p_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max DATE;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN;
  END IF;

  SELECT MAX(planned_due_date::date)
  INTO v_max
  FROM public.tasks
  WHERE project_id = p_project_id
    AND planned_due_date IS NOT NULL;

  IF v_max IS NOT NULL THEN
    UPDATE public.projects
    SET planned_end_date = v_max
    WHERE id = p_project_id
      AND (planned_end_date IS DISTINCT FROM v_max);
  ELSE
    UPDATE public.projects
    SET planned_end_date = NULL
    WHERE id = p_project_id
      AND planned_end_date IS NOT NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recalc_project_planned_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_project_planned_end_date(OLD.project_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalc_project_planned_end_date(NEW.project_id);

  IF TG_OP = 'UPDATE'
     AND NEW.project_id IS DISTINCT FROM OLD.project_id
     AND OLD.project_id IS NOT NULL THEN
    PERFORM public.recalc_project_planned_end_date(OLD.project_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_project_planned_end_date ON public.tasks;

CREATE TRIGGER trg_recalc_project_planned_end_date
AFTER INSERT OR UPDATE OF planned_due_date, project_id OR DELETE
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tg_recalc_project_planned_end_date();

-- Backfill
DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.projects LOOP
    PERFORM public.recalc_project_planned_end_date(v_id);
  END LOOP;
END
$$;
