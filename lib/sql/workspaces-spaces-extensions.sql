-- ============================================================================
-- HYDRACODE — Extensões Espaços (vistas, kanban, campos customizados, itens, prefs)
-- ============================================================================
-- Rode DEPOIS de workspaces-spaces.sql. Idempotente.
-- ============================================================================

ALTER TABLE public.workspace_space_nodes
  ADD COLUMN IF NOT EXISTS default_view text NOT NULL DEFAULT 'list';

ALTER TABLE public.workspace_space_nodes
  DROP CONSTRAINT IF EXISTS workspace_space_nodes_default_view_check;

ALTER TABLE public.workspace_space_nodes
  ADD CONSTRAINT workspace_space_nodes_default_view_check CHECK (default_view IN ('list', 'kanban'));

ALTER TABLE public.workspace_space_nodes
  ADD COLUMN IF NOT EXISTS custom_field_definitions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.workspace_space_nodes
  ADD COLUMN IF NOT EXISTS kanban_columns jsonb NOT NULL DEFAULT '[
    {"key":"todo","label":"A fazer"},
    {"key":"doing","label":"Em andamento"},
    {"key":"done","label":"Feito"}
  ]'::jsonb;

-- --------------------------------------------------------------------------
-- Itens dentro de uma lista (linhas editáveis + quadro kanban)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_node_id uuid NOT NULL REFERENCES public.workspace_space_nodes(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  status_key text NOT NULL DEFAULT 'todo',
  sort_order int NOT NULL DEFAULT 0,
  custom_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_list_items_list_sort
  ON public.workspace_list_items(list_node_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_workspace_list_items_status
  ON public.workspace_list_items(list_node_id, status_key);

-- --------------------------------------------------------------------------
-- Preferências de UI por usuário (vista ativa, árvore expandida, etc.)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_workspace_prefs (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_workspace_prefs ENABLE ROW LEVEL SECURITY;

-- Itens: mesmo critério dos nós
DROP POLICY IF EXISTS workspace_list_items_select ON public.workspace_list_items;
CREATE POLICY workspace_list_items_select ON public.workspace_list_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS workspace_list_items_insert ON public.workspace_list_items;
CREATE POLICY workspace_list_items_insert ON public.workspace_list_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider', 'projetista', 'employee'
    )
  );

DROP POLICY IF EXISTS workspace_list_items_update ON public.workspace_list_items;
CREATE POLICY workspace_list_items_update ON public.workspace_list_items
  FOR UPDATE TO authenticated
  USING (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider', 'projetista', 'employee'
    )
  )
  WITH CHECK (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider', 'projetista', 'employee'
    )
  );

DROP POLICY IF EXISTS workspace_list_items_delete ON public.workspace_list_items;
CREATE POLICY workspace_list_items_delete ON public.workspace_list_items
  FOR DELETE TO authenticated
  USING (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
    )
  );

-- Prefs: só o próprio usuário
DROP POLICY IF EXISTS user_workspace_prefs_select ON public.user_workspace_prefs;
CREATE POLICY user_workspace_prefs_select ON public.user_workspace_prefs
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_workspace_prefs_insert ON public.user_workspace_prefs;
CREATE POLICY user_workspace_prefs_insert ON public.user_workspace_prefs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_workspace_prefs_update ON public.user_workspace_prefs;
CREATE POLICY user_workspace_prefs_update ON public.user_workspace_prefs
  FOR UPDATE TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS user_workspace_prefs_delete ON public.user_workspace_prefs;
CREATE POLICY user_workspace_prefs_delete ON public.user_workspace_prefs
  FOR DELETE TO authenticated
  USING (user_id = public.current_app_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_list_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_workspace_prefs TO authenticated;
