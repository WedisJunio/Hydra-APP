-- ============================================================================
-- HYDRACODE — AUTO-VINCULO DE EQUIPE AO CRIAR/ATRIBUIR TAREFA
-- ============================================================================
-- Objetivo:
--   Sempre que uma tarefa for criada ou atribuida a alguem, garantir que
--   - O responsavel (assigned_to)
--   - O lider do projeto (leader_id)
--   - O gerente do projeto (manager_id)
--   - O coordenador do projeto (coordinator_id), se existir
--   - O criador da tarefa (created_by)
--   estejam todos vinculados ao project_members.
--
-- Idempotente. Pode rodar varias vezes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ensure_task_team_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID := NEW.project_id;
  v_manager UUID;
  v_coordinator UUID;
  v_leader UUID;
BEGIN
  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT manager_id, coordinator_id, leader_id
    INTO v_manager, v_coordinator, v_leader
  FROM public.projects
  WHERE id = v_project_id;

  -- Responsavel da tarefa
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (v_project_id, NEW.assigned_to, 'member')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- Criador da tarefa
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (v_project_id, NEW.created_by, 'member')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- Lider do projeto
  IF v_leader IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (v_project_id, v_leader, 'leader')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- Coordenador do projeto
  IF v_coordinator IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (v_project_id, v_coordinator, 'coordinator')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- Gerente do projeto
  IF v_manager IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (v_project_id, v_manager, 'manager')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_task_team_membership ON public.tasks;

CREATE TRIGGER trg_ensure_task_team_membership
AFTER INSERT OR UPDATE OF assigned_to, project_id ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.ensure_task_team_membership();

-- ─── BACKFILL — vincula equipe das tarefas ja existentes ──────────────────
-- Insere em project_members todo mundo que ja deveria estar la com base nas
-- tarefas ja cadastradas + dados do projeto (lider, gerente, coordenador).

INSERT INTO public.project_members (project_id, user_id, role)
SELECT DISTINCT t.project_id, t.assigned_to, 'member'
FROM public.tasks t
WHERE t.project_id IS NOT NULL AND t.assigned_to IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO public.project_members (project_id, user_id, role)
SELECT DISTINCT t.project_id, t.created_by, 'member'
FROM public.tasks t
WHERE t.project_id IS NOT NULL AND t.created_by IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO public.project_members (project_id, user_id, role)
SELECT DISTINCT p.id, p.leader_id, 'leader'
FROM public.projects p
WHERE p.leader_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = p.id)
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO public.project_members (project_id, user_id, role)
SELECT DISTINCT p.id, p.coordinator_id, 'coordinator'
FROM public.projects p
WHERE p.coordinator_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = p.id)
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO public.project_members (project_id, user_id, role)
SELECT DISTINCT p.id, p.manager_id, 'manager'
FROM public.projects p
WHERE p.manager_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = p.id)
ON CONFLICT (project_id, user_id) DO NOTHING;
