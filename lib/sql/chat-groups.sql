-- ============================================================================
-- HYDRACODE — CHAT GROUPS (projeto + grupos avulsos)
-- ============================================================================
-- Objetivo:
-- 1) Permitir grupos de chat sem projeto ("4º andar", "RH", etc).
-- 2) Garantir que todo projeto tenha um grupo de chat.
-- 3) Migrar mensagens existentes para usar chat_group_id.
--
-- Pode ser executado múltiplas vezes (idempotente).
-- ============================================================================

-- ─── 1. Estrutura ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id UUID UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS chat_group_id UUID REFERENCES public.chat_groups(id) ON DELETE CASCADE;

ALTER TABLE public.messages
  ALTER COLUMN project_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS chat_groups_project_id_idx ON public.chat_groups(project_id);
CREATE INDEX IF NOT EXISTS chat_groups_name_idx ON public.chat_groups(name);
CREATE INDEX IF NOT EXISTS messages_chat_group_id_idx ON public.messages(chat_group_id);

-- ─── 2. Backfill grupos por projeto ───────────────────────────────────────────

INSERT INTO public.chat_groups (name, project_id, created_by)
SELECT p.name, p.id, p.created_by
FROM public.projects p
LEFT JOIN public.chat_groups cg ON cg.project_id = p.id
WHERE cg.id IS NULL;

-- ─── 3. Backfill mensagens para chat_group_id ─────────────────────────────────

UPDATE public.messages m
SET chat_group_id = cg.id
FROM public.chat_groups cg
WHERE m.project_id IS NOT NULL
  AND cg.project_id = m.project_id
  AND m.chat_group_id IS NULL;

-- ─── 4. Trigger: novo projeto => grupo automático ────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_project_chat_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_groups (name, project_id, created_by)
  VALUES (NEW.name, NEW.id, NEW.created_by)
  ON CONFLICT (project_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_project_chat_group ON public.projects;
CREATE TRIGGER trg_ensure_project_chat_group
AFTER INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.ensure_project_chat_group();

-- ─── 5. Helpers de acesso para RLS ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_chat_group(p_chat_group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.chat_groups cg
      WHERE cg.id = p_chat_group_id
        AND (
          cg.project_id IS NULL
          OR public.is_project_member(cg.project_id)
        )
    );
$$;

-- ─── 6. RLS: chat_groups ─────────────────────────────────────────────────────

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_groups_select ON public.chat_groups;
DROP POLICY IF EXISTS chat_groups_insert ON public.chat_groups;
DROP POLICY IF EXISTS chat_groups_update ON public.chat_groups;
DROP POLICY IF EXISTS chat_groups_delete ON public.chat_groups;

CREATE POLICY chat_groups_select ON public.chat_groups
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR project_id IS NULL
    OR public.is_project_member(project_id)
  );

CREATE POLICY chat_groups_insert ON public.chat_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    -- grupos de projeto são automáticos via trigger; INSERT manual só avulso
    project_id IS NULL
    AND created_by = public.current_app_user_id()
    AND public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
    )
  );

CREATE POLICY chat_groups_update ON public.chat_groups
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR created_by = public.current_app_user_id())
  WITH CHECK (public.is_admin() OR created_by = public.current_app_user_id());

CREATE POLICY chat_groups_delete ON public.chat_groups
  FOR DELETE TO authenticated
  USING (public.is_admin() OR created_by = public.current_app_user_id());

-- ─── 7. RLS: messages (agora com chat_group_id) ──────────────────────────────

DROP POLICY IF EXISTS messages_select ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;
DROP POLICY IF EXISTS messages_update ON public.messages;
DROP POLICY IF EXISTS messages_delete ON public.messages;

CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      project_id IS NOT NULL
      AND public.is_project_member(project_id)
    )
    OR (
      chat_group_id IS NOT NULL
      AND public.can_access_chat_group(chat_group_id)
    )
  );

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = public.current_app_user_id()
    AND (
      public.is_admin()
      OR (
        project_id IS NOT NULL
        AND public.is_project_member(project_id)
      )
      OR (
        chat_group_id IS NOT NULL
        AND public.can_access_chat_group(chat_group_id)
      )
    )
  );

CREATE POLICY messages_update ON public.messages
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR sender_id = public.current_app_user_id())
  WITH CHECK (public.is_admin() OR sender_id = public.current_app_user_id());

CREATE POLICY messages_delete ON public.messages
  FOR DELETE TO authenticated
  USING (public.is_admin() OR sender_id = public.current_app_user_id());
