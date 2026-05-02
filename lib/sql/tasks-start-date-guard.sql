-- ============================================================================
-- HYDRACODE — GUARDA DE DATA DE INÍCIO EM TASKS
-- ============================================================================
-- Regras:
-- 1) start_date sempre nasce com a data de criação da tarefa.
-- 2) admin, gerência, coordenador, líder ou projetista_lider pode alterar start_date depois.
-- ============================================================================

-- Sempre define data de início na criação com a data atual
CREATE OR REPLACE FUNCTION public.set_task_start_date_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.start_date := CURRENT_DATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_set_start_date_on_insert ON public.tasks;
CREATE TRIGGER trg_tasks_set_start_date_on_insert
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_task_start_date_on_insert();

-- Bloqueia alteração de start_date para papéis não autorizados
CREATE OR REPLACE FUNCTION public.guard_task_start_date_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    v_role := public.current_app_user_role();
    IF v_role NOT IN ('admin', 'manager', 'coordinator', 'leader', 'projetista_lider') THEN
      RAISE EXCEPTION 'Somente gestão do projeto ou perfil autorizado pode alterar a data de início da tarefa.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_guard_start_date_update ON public.tasks;
CREATE TRIGGER trg_tasks_guard_start_date_update
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.guard_task_start_date_update();
