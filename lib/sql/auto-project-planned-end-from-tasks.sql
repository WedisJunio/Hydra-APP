-- ============================================================================
-- HYDRACODE — PREVISÃO EFETIVA DE ENTREGA DO PROJETO
-- ============================================================================
-- projects.planned_end_target  = meta / compromisso (informada no cadastro,
--      visível para cliente e cronograma externo).
-- Maior planned_due_date entre tarefas = prazo agregado da execução.
-- projects.planned_end_date    = o MAIS TARDIO entre target e tarefas
--      (NULL só quando ambos forem nulos).
--
-- Execute no Supabase após versões anteriores deste script (idempotente).
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS planned_end_target DATE;

CREATE OR REPLACE FUNCTION public.recalc_project_planned_end_date(p_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max DATE;
  v_target DATE;
  v_final DATE;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN;
  END IF;

  SELECT MAX(planned_due_date::date)
  INTO v_max
  FROM public.tasks
  WHERE project_id = p_project_id
    AND planned_due_date IS NOT NULL;

  SELECT planned_end_target
  INTO v_target
  FROM public.projects
  WHERE id = p_project_id;

  IF v_target IS NULL AND v_max IS NULL THEN
    v_final := NULL;
  ELSIF v_target IS NULL THEN
    v_final := v_max;
  ELSIF v_max IS NULL THEN
    v_final := v_target;
  ELSE
    v_final := GREATEST(v_target, v_max);
  END IF;

  UPDATE public.projects
  SET planned_end_date = v_final
  WHERE id = p_project_id
    AND (planned_end_date IS DISTINCT FROM v_final);
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

CREATE OR REPLACE FUNCTION public.tg_recalc_project_planned_on_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_project_planned_end_date(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_project_planned_on_target ON public.projects;

CREATE TRIGGER trg_recalc_project_planned_on_target
AFTER INSERT OR UPDATE OF planned_end_target
ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.tg_recalc_project_planned_on_target();

-- Backfill planned_end_date a partir de target + tarefas
DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.projects LOOP
    PERFORM public.recalc_project_planned_end_date(v_id);
  END LOOP;
END
$$;
