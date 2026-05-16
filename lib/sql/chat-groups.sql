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
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.messages
  ALTER COLUMN project_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_group_members (
  chat_group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_groups_project_id_idx ON public.chat_groups(project_id);
CREATE INDEX IF NOT EXISTS chat_groups_name_idx ON public.chat_groups(name);
CREATE INDEX IF NOT EXISTS messages_chat_group_id_idx ON public.messages(chat_group_id);
CREATE INDEX IF NOT EXISTS chat_group_members_user_id_idx ON public.chat_group_members(user_id);

-- ─── 2. Backfill grupos por projeto ───────────────────────────────────────────

INSERT INTO public.chat_groups (name, project_id, created_by)
SELECT p.name, p.id, p.created_by
FROM public.projects p
LEFT JOIN public.chat_groups cg ON cg.project_id = p.id
WHERE cg.id IS NULL;

-- Creator becomes the first member of existing ad hoc groups.
INSERT INTO public.chat_group_members (chat_group_id, user_id, added_by)
SELECT id, created_by, created_by
FROM public.chat_groups
WHERE project_id IS NULL
  AND created_by IS NOT NULL
ON CONFLICT (chat_group_id, user_id) DO NOTHING;

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
          (
            cg.project_id IS NULL
            AND (
              cg.created_by = public.current_app_user_id()
              OR EXISTS (
                SELECT 1
                FROM public.chat_group_members cgm
                WHERE cgm.chat_group_id = cg.id
                  AND cgm.user_id = public.current_app_user_id()
              )
            )
          )
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
    OR public.is_project_member(project_id)
    OR (
      project_id IS NULL
      AND (
        created_by = public.current_app_user_id()
        OR EXISTS (
          SELECT 1
          FROM public.chat_group_members cgm
          WHERE cgm.chat_group_id = id
            AND cgm.user_id = public.current_app_user_id()
        )
      )
    )
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

-- ─── 6b. RLS: chat_group_members ───────────────────────────────────────────

ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_group_members_select ON public.chat_group_members;
DROP POLICY IF EXISTS chat_group_members_insert ON public.chat_group_members;
DROP POLICY IF EXISTS chat_group_members_delete ON public.chat_group_members;

CREATE POLICY chat_group_members_select ON public.chat_group_members
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR user_id = public.current_app_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.chat_groups cg
      WHERE cg.id = chat_group_id
        AND (
          cg.created_by = public.current_app_user_id()
          OR public.is_project_member(cg.project_id)
          OR EXISTS (
            SELECT 1
            FROM public.chat_group_members mine
            WHERE mine.chat_group_id = chat_group_id
              AND mine.user_id = public.current_app_user_id()
          )
        )
    )
  );

CREATE POLICY chat_group_members_insert ON public.chat_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.chat_groups cg
      WHERE cg.id = chat_group_id
        AND cg.project_id IS NULL
        AND (
          cg.created_by = public.current_app_user_id()
          OR public.current_app_user_role() IN (
            'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
          )
        )
    )
  );

CREATE POLICY chat_group_members_delete ON public.chat_group_members
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.chat_groups cg
      WHERE cg.id = chat_group_id
        AND cg.project_id IS NULL
        AND (
          cg.created_by = public.current_app_user_id()
          OR public.current_app_user_role() IN (
            'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
          )
        )
    )
  );

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
