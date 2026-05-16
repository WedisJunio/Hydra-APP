-- Chat members hotfix without dollar-quoted function bodies.
-- Run this whole file in Supabase SQL Editor after clearing the editor.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.chat_group_members (
  chat_group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_group_members_user_id_idx
  ON public.chat_group_members(user_id);

INSERT INTO public.chat_group_members (chat_group_id, user_id, added_by)
SELECT id, created_by, created_by
FROM public.chat_groups
WHERE project_id IS NULL
  AND created_by IS NOT NULL
ON CONFLICT (chat_group_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_chat_group_member(p_chat_group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS '
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members cgm
    WHERE cgm.chat_group_id = p_chat_group_id
      AND cgm.user_id = public.current_app_user_id()
  );
';

CREATE OR REPLACE FUNCTION public.can_manage_chat_group_members(p_chat_group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS '
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.chat_groups cg
      WHERE cg.id = p_chat_group_id
        AND cg.project_id IS NULL
        AND (
          cg.created_by = public.current_app_user_id()
          OR public.current_app_user_role() IN (
            ''admin'', ''manager'', ''coordinator'', ''leader'', ''projetista_lider''
          )
        )
    );
';

CREATE OR REPLACE FUNCTION public.add_chat_group_member(
  p_chat_group_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS '
  INSERT INTO public.chat_group_members (chat_group_id, user_id, added_by)
  SELECT p_chat_group_id, p_user_id, public.current_app_user_id()
  WHERE public.can_manage_chat_group_members(p_chat_group_id)
  ON CONFLICT (chat_group_id, user_id) DO NOTHING;
';

CREATE OR REPLACE FUNCTION public.remove_chat_group_member(
  p_chat_group_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS '
  DELETE FROM public.chat_group_members
  WHERE chat_group_id = p_chat_group_id
    AND user_id = p_user_id
    AND p_user_id <> public.current_app_user_id()
    AND public.can_manage_chat_group_members(p_chat_group_id);
';

ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_group_members_select ON public.chat_group_members;
DROP POLICY IF EXISTS chat_group_members_insert ON public.chat_group_members;
DROP POLICY IF EXISTS chat_group_members_delete ON public.chat_group_members;

CREATE POLICY chat_group_members_select ON public.chat_group_members
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR user_id = public.current_app_user_id()
    OR public.can_manage_chat_group_members(chat_group_id)
    OR public.is_chat_group_member(chat_group_id)
  );

CREATE POLICY chat_group_members_insert ON public.chat_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_chat_group_members(chat_group_id)
  );

CREATE POLICY chat_group_members_delete ON public.chat_group_members
  FOR DELETE TO authenticated
  USING (
    public.can_manage_chat_group_members(chat_group_id)
  );
