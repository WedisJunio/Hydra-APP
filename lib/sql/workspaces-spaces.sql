-- ============================================================================
-- HYDRACODE — Espaços de trabalho (espaço → pastas → listas)
-- ============================================================================
-- Hierarquia:
--   workspace_spaces     = espaço de topo (ex.: COPASA, Processos internos)
--   workspace_space_nodes = pasta (folder) ou lista (list); listas podem vincular um projeto
--
-- Pré-requisitos: tabelas public.users e public.projects já existentes.
-- Rode no Supabase → SQL Editor. Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  icon text NOT NULL DEFAULT 'layers',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.workspace_space_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.workspace_spaces(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.workspace_space_nodes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('folder', 'list')),
  name text NOT NULL,
  color text,
  sort_order int NOT NULL DEFAULT 0,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_space_nodes_folder_no_project CHECK (
    kind <> 'folder' OR project_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_workspace_space_nodes_space_parent
  ON public.workspace_space_nodes(space_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_workspace_space_nodes_project
  ON public.workspace_space_nodes(project_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.workspace_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_space_nodes ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado (organização interna).
DROP POLICY IF EXISTS workspace_spaces_select ON public.workspace_spaces;
CREATE POLICY workspace_spaces_select ON public.workspace_spaces
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS workspace_spaces_insert ON public.workspace_spaces;
CREATE POLICY workspace_spaces_insert ON public.workspace_spaces
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_user_role() IN ('admin', 'manager', 'coordinator')
  );

DROP POLICY IF EXISTS workspace_spaces_update ON public.workspace_spaces;
CREATE POLICY workspace_spaces_update ON public.workspace_spaces
  FOR UPDATE TO authenticated
  USING (
    public.current_app_user_role() IN ('admin', 'manager', 'coordinator')
  )
  WITH CHECK (
    public.current_app_user_role() IN ('admin', 'manager', 'coordinator')
  );

DROP POLICY IF EXISTS workspace_spaces_delete ON public.workspace_spaces;
CREATE POLICY workspace_spaces_delete ON public.workspace_spaces
  FOR DELETE TO authenticated
  USING (
    public.current_app_user_role() IN ('admin', 'manager', 'coordinator')
  );

DROP POLICY IF EXISTS workspace_space_nodes_select ON public.workspace_space_nodes;
CREATE POLICY workspace_space_nodes_select ON public.workspace_space_nodes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS workspace_space_nodes_insert ON public.workspace_space_nodes;
CREATE POLICY workspace_space_nodes_insert ON public.workspace_space_nodes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
    )
  );

DROP POLICY IF EXISTS workspace_space_nodes_update ON public.workspace_space_nodes;
CREATE POLICY workspace_space_nodes_update ON public.workspace_space_nodes
  FOR UPDATE TO authenticated
  USING (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
    )
  )
  WITH CHECK (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
    )
  );

DROP POLICY IF EXISTS workspace_space_nodes_delete ON public.workspace_space_nodes;
CREATE POLICY workspace_space_nodes_delete ON public.workspace_space_nodes
  FOR DELETE TO authenticated
  USING (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_spaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_space_nodes TO authenticated;

-- Próximo passo (opcional): lib/sql/workspaces-spaces-extensions.sql
-- (itens de lista, Kanban, campos customizados, preferências por usuário).
