-- ============================================================================
-- HYDRACODE — PERMISSÕES (Row Level Security do Supabase)
-- ============================================================================
-- Define quem pode ler/criar/editar/excluir cada tabela com base no papel
-- (role) do usuário e na sua participação no projeto.
--
-- PAPÉIS:
--   admin       — pode TUDO em todas as tabelas
--   manager     — gerencia portfólio, cria projetos, cadastra clientes/usuários
--   coordinator — gerencia projetos onde participa como coordenador
--   leader      — lidera execução de projetos onde está como líder
--   projetista_lider — cria projetos; edita projetos/tarefas como líder de projeto
--   projetista  — escopo próprio (tarefas vinculadas); em projetos prioriza criar tarefas
--   employee    — legado; tratado como projetista na aplicação
--
-- COMO USAR:
-- 1. Rodar PRIMEIRO o arquivo lib/sql/saneamento-schema.sql (cria as tabelas)
-- 2. Abrir o Supabase Studio → SQL Editor
-- 3. Colar este arquivo inteiro e clicar em Run
-- 4. Definir SEU usuário como admin (ver fim do arquivo)
--
-- IDEMPOTENTE: pode rodar múltiplas vezes sem quebrar.
--
-- Regras de interface (menu, botões) ficam em lib/permissions/ — mantenha alinhado ao RLS.
-- ============================================================================


-- ─── 1. HELPER FUNCTIONS ────────────────────────────────────────────────────
-- Funções com SECURITY DEFINER bypassam RLS para evitar recursão infinita
-- ao consultar a tabela "users" dentro de policies da própria "users".

-- ID do usuário de aplicação (linha em "users") do auth.uid() atual.
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE
    u.auth_user_id = auth.uid()
    OR (
      u.auth_user_id IS NULL
      AND LOWER(u.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1;
$$;

-- Papel (role) do usuário atual.
CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.role
  FROM public.users u
  WHERE
    u.auth_user_id = auth.uid()
    OR (
      u.auth_user_id IS NULL
      AND LOWER(u.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1;
$$;

-- O usuário atual é admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  );
$$;

-- O usuário atual é admin ou manager?
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid() AND role IN ('admin', 'manager')
  );
$$;

-- Acesso ao portfólio completo (dashboard, ponto da equipe, etc.) — alinhar a lib/permissions/roles.ts
CREATE OR REPLACE FUNCTION public.has_full_portfolio_access()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role IN ('admin', 'manager', 'coordinator', 'leader')
  );
$$;

-- Pode atualizar qualquer linha em users (papel, perfil) — coordenação, líder, gerência ou admin.
CREATE OR REPLACE FUNCTION public.can_update_any_user_profile()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND role IN ('admin', 'manager', 'coordinator', 'leader')
  );
$$;

-- O usuário atual participa do projeto p_project_id?
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = public.current_app_user_id()
  )
  OR EXISTS (
    -- também conta quem está como manager/coordinator/leader direto na linha do projeto
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND public.current_app_user_id() IN (
        p.manager_id, p.coordinator_id, p.leader_id, p.created_by
      )
  );
$$;

-- O usuário atual lidera o projeto (gerente, coordenador ou líder)?
CREATE OR REPLACE FUNCTION public.is_project_lead(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND public.current_app_user_id() IN (
        p.manager_id, p.coordinator_id, p.leader_id, p.created_by
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = public.current_app_user_id()
      AND pm.role IN ('manager', 'coordinator', 'leader')
  );
$$;


-- ─── 1b. COLUNA role EM users — CHECK alinhado aos papéis da aplicação ─────
-- Sem isso, atualizar perfil com "coordinator" / projetista falha com:
--   new row for relation 'users' violates check constraint 'users_role_check'

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      'admin',
      'manager',
      'coordinator',
      'leader',
      'employee',
      'projetista',
      'projetista_lider'
    )
  );


-- ─── 2. HABILITAR RLS EM TODAS AS TABELAS ───────────────────────────────────

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_approvals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_revisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;


-- ─── 3. POLICIES — USERS ────────────────────────────────────────────────────
-- Todos veem todos (lista de colegas). Admin/manager criam. Cada um edita o
-- próprio registro; admin ou gestão (coord./líder/gerência) pode editar qualquer um. Só admin exclui.
-- Auto-cadastro: usuário recém-registrado pode inserir seu próprio perfil
-- (auth_user_id = auth.uid()).

DROP POLICY IF EXISTS users_select      ON public.users;
DROP POLICY IF EXISTS users_insert      ON public.users;
DROP POLICY IF EXISTS users_self_insert ON public.users;
DROP POLICY IF EXISTS users_update      ON public.users;
DROP POLICY IF EXISTS users_delete      ON public.users;

CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (true);

-- Admins/managers criam qualquer usuário (cadastro administrativo)
CREATE POLICY users_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_above());

-- Auto-cadastro: a pessoa pode criar seu próprio registro vinculando ao auth.uid()
CREATE POLICY users_self_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY users_update ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR auth_user_id = auth.uid()
    OR public.can_update_any_user_profile()
  )
  WITH CHECK (
    public.is_admin()
    OR auth_user_id = auth.uid()
    OR public.can_update_any_user_profile()
  );

CREATE POLICY users_delete ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ─── 4. POLICIES — CLIENTS (concessionárias, prefeituras) ──────────────────

DROP POLICY IF EXISTS clients_select ON public.clients;
DROP POLICY IF EXISTS clients_insert ON public.clients;
DROP POLICY IF EXISTS clients_update ON public.clients;
DROP POLICY IF EXISTS clients_delete ON public.clients;

CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY clients_update ON public.clients
  FOR UPDATE TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY clients_delete ON public.clients
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ─── 5. POLICIES — PROJECTS ─────────────────────────────────────────────────
-- SELECT: admin vê tudo; outros veem só projetos onde participam.
-- INSERT: admin / manager / coordinator / leader / projetista_lider.
-- UPDATE: admin OU líder do projeto.
-- DELETE: só admin.

DROP POLICY IF EXISTS projects_select ON public.projects;
DROP POLICY IF EXISTS projects_insert ON public.projects;
DROP POLICY IF EXISTS projects_update ON public.projects;
DROP POLICY IF EXISTS projects_delete ON public.projects;

CREATE POLICY projects_select ON public.projects
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_project_member(id)
  );

CREATE POLICY projects_insert ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_user_role() IN (
      'admin', 'manager', 'coordinator', 'leader', 'projetista_lider'
    )
  );

CREATE POLICY projects_update ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_project_lead(id))
  WITH CHECK (public.is_admin() OR public.is_project_lead(id));

CREATE POLICY projects_delete ON public.projects
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ─── 6. POLICIES — PROJECT_MEMBERS ──────────────────────────────────────────

DROP POLICY IF EXISTS project_members_select ON public.project_members;
DROP POLICY IF EXISTS project_members_insert ON public.project_members;
DROP POLICY IF EXISTS project_members_update ON public.project_members;
DROP POLICY IF EXISTS project_members_delete ON public.project_members;

CREATE POLICY project_members_select ON public.project_members
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR public.is_project_member(project_id)
  );

CREATE POLICY project_members_insert ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR public.is_project_lead(project_id)
  );

CREATE POLICY project_members_update ON public.project_members
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_project_lead(project_id))
  WITH CHECK (public.is_admin() OR public.is_project_lead(project_id));

CREATE POLICY project_members_delete ON public.project_members
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_project_lead(project_id));


-- ─── 7. POLICIES — PROJECT_PHASES ───────────────────────────────────────────

DROP POLICY IF EXISTS project_phases_select ON public.project_phases;
DROP POLICY IF EXISTS project_phases_insert ON public.project_phases;
DROP POLICY IF EXISTS project_phases_update ON public.project_phases;
DROP POLICY IF EXISTS project_phases_delete ON public.project_phases;

CREATE POLICY project_phases_select ON public.project_phases
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY project_phases_insert ON public.project_phases
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_project_lead(project_id));

CREATE POLICY project_phases_update ON public.project_phases
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_project_lead(project_id))
  WITH CHECK (public.is_admin() OR public.is_project_lead(project_id));

CREATE POLICY project_phases_delete ON public.project_phases
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_project_lead(project_id));


-- ─── 8. POLICIES — EXTERNAL_APPROVALS ───────────────────────────────────────

DROP POLICY IF EXISTS external_approvals_select ON public.external_approvals;
DROP POLICY IF EXISTS external_approvals_insert ON public.external_approvals;
DROP POLICY IF EXISTS external_approvals_update ON public.external_approvals;
DROP POLICY IF EXISTS external_approvals_delete ON public.external_approvals;

CREATE POLICY external_approvals_select ON public.external_approvals
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY external_approvals_insert ON public.external_approvals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY external_approvals_update ON public.external_approvals
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_project_member(project_id))
  WITH CHECK (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY external_approvals_delete ON public.external_approvals
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_project_lead(project_id));


-- ─── 9. POLICIES — DOCUMENT_REVISIONS ───────────────────────────────────────
-- Qualquer membro do projeto pode subir uma revisão. Autor pode editar a sua.

DROP POLICY IF EXISTS document_revisions_select ON public.document_revisions;
DROP POLICY IF EXISTS document_revisions_insert ON public.document_revisions;
DROP POLICY IF EXISTS document_revisions_update ON public.document_revisions;
DROP POLICY IF EXISTS document_revisions_delete ON public.document_revisions;

CREATE POLICY document_revisions_select ON public.document_revisions
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY document_revisions_insert ON public.document_revisions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY document_revisions_update ON public.document_revisions
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR author_id = public.current_app_user_id()
    OR public.is_project_lead(project_id)
  )
  WITH CHECK (
    public.is_admin()
    OR author_id = public.current_app_user_id()
    OR public.is_project_lead(project_id)
  );

CREATE POLICY document_revisions_delete ON public.document_revisions
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR author_id = public.current_app_user_id()
    OR public.is_project_lead(project_id)
  );


-- ─── 10. POLICIES — ARTS (responsabilidade técnica) ────────────────────────

DROP POLICY IF EXISTS arts_select ON public.arts;
DROP POLICY IF EXISTS arts_insert ON public.arts;
DROP POLICY IF EXISTS arts_update ON public.arts;
DROP POLICY IF EXISTS arts_delete ON public.arts;

CREATE POLICY arts_select ON public.arts
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY arts_insert ON public.arts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_project_lead(project_id));

CREATE POLICY arts_update ON public.arts
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_project_lead(project_id))
  WITH CHECK (public.is_admin() OR public.is_project_lead(project_id));

CREATE POLICY arts_delete ON public.arts
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_project_lead(project_id));


-- ─── 11. POLICIES — TASKS ───────────────────────────────────────────────────
-- Membro do projeto cria tarefas.
-- UPDATE: apenas responsável, admin, coordinator ou employee (projetista legado).

DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_delete ON public.tasks;

CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_project_member(project_id));

CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.current_app_user_role() IN ('coordinator', 'employee')
    OR assigned_to = public.current_app_user_id()
  )
  WITH CHECK (
    public.is_admin()
    OR public.current_app_user_role() IN ('coordinator', 'employee')
    OR assigned_to = public.current_app_user_id()
  );

CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.is_project_lead(project_id)
    OR created_by = public.current_app_user_id()
  );


-- ─── 12. POLICIES — MESSAGES ────────────────────────────────────────────────
-- Mensagens podem ser em projetos (scoped) ou diretas entre usuários.

DROP POLICY IF EXISTS messages_select ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;
DROP POLICY IF EXISTS messages_update ON public.messages;
DROP POLICY IF EXISTS messages_delete ON public.messages;

CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      -- Mensagens de projeto: vê se for membro
      project_id IS NOT NULL AND public.is_project_member(project_id)
    )
    OR (
      -- Mensagens diretas: vê se for sender ou recipient
      project_id IS NULL
      AND (
        sender_id = public.current_app_user_id()
        OR recipient_id = public.current_app_user_id()
      )
    )
  );

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = public.current_app_user_id()
    AND (
      -- Mensagens de projeto: só se for membro
      (project_id IS NOT NULL AND public.is_project_member(project_id))
      -- Mensagens diretas: sempre permitido para usuários autenticados
      OR project_id IS NULL
    )
  );

CREATE POLICY messages_update ON public.messages
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR sender_id = public.current_app_user_id())
  WITH CHECK (public.is_admin() OR sender_id = public.current_app_user_id());

CREATE POLICY messages_delete ON public.messages
  FOR DELETE TO authenticated
  USING (public.is_admin() OR sender_id = public.current_app_user_id());


-- ─── 13. POLICIES — MEETING_ROOMS ───────────────────────────────────────────
-- Recurso compartilhado. Todos veem; só admin/manager cadastram salas novas.

DROP POLICY IF EXISTS meeting_rooms_select ON public.meeting_rooms;
DROP POLICY IF EXISTS meeting_rooms_insert ON public.meeting_rooms;
DROP POLICY IF EXISTS meeting_rooms_update ON public.meeting_rooms;
DROP POLICY IF EXISTS meeting_rooms_delete ON public.meeting_rooms;

CREATE POLICY meeting_rooms_select ON public.meeting_rooms
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY meeting_rooms_insert ON public.meeting_rooms
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY meeting_rooms_update ON public.meeting_rooms
  FOR UPDATE TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY meeting_rooms_delete ON public.meeting_rooms
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- ─── 14. POLICIES — MEETINGS ────────────────────────────────────────────────
-- Reuniões aparecem para todos (agenda compartilhada). Quem cria edita/exclui.

DROP POLICY IF EXISTS meetings_select ON public.meetings;
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
DROP POLICY IF EXISTS meetings_update ON public.meetings;
DROP POLICY IF EXISTS meetings_delete ON public.meetings;

CREATE POLICY meetings_select ON public.meetings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY meetings_insert ON public.meetings
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.current_app_user_id());

CREATE POLICY meetings_update ON public.meetings
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR created_by = public.current_app_user_id())
  WITH CHECK (public.is_admin() OR created_by = public.current_app_user_id());

CREATE POLICY meetings_delete ON public.meetings
  FOR DELETE TO authenticated
  USING (public.is_admin() OR created_by = public.current_app_user_id());


-- ─── 15. POLICIES — MEETING_PARTICIPANTS ────────────────────────────────────

DROP POLICY IF EXISTS meeting_participants_select ON public.meeting_participants;
DROP POLICY IF EXISTS meeting_participants_insert ON public.meeting_participants;
DROP POLICY IF EXISTS meeting_participants_update ON public.meeting_participants;
DROP POLICY IF EXISTS meeting_participants_delete ON public.meeting_participants;

CREATE POLICY meeting_participants_select ON public.meeting_participants
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY meeting_participants_insert ON public.meeting_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.created_by = public.current_app_user_id()
    )
  );

CREATE POLICY meeting_participants_update ON public.meeting_participants
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR user_id = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.created_by = public.current_app_user_id()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR user_id = public.current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.created_by = public.current_app_user_id()
    )
  );

CREATE POLICY meeting_participants_delete ON public.meeting_participants
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND m.created_by = public.current_app_user_id()
    )
  );


-- ============================================================================
-- 16. PROMOVA SEU USUÁRIO A ADMIN
-- ============================================================================
-- IMPORTANTE: depois de rodar tudo acima, marque seu usuário como admin para
-- não ficar sem acesso. Substitua o e-mail abaixo pelo seu e descomente:
--
-- UPDATE public.users
-- SET role = 'admin'
-- WHERE email = 'seu-email@empresa.com';
--
-- Para verificar:
-- SELECT id, name, email, role FROM public.users WHERE role = 'admin';
-- ============================================================================


-- ============================================================================
-- RESUMO DAS PERMISSÕES (matriz rápida)
-- ============================================================================
--
-- TABELA              | admin | manager | coord. | leader | employee
-- ────────────────────┼───────┼─────────┼────────┼────────┼─────────
-- users    SELECT     |   ✓   |    ✓    |    ✓   |   ✓   |    ✓
-- users    INSERT     |   ✓   |    ✓    |    -   |   -   |    -
-- users    UPDATE     |   ✓   |   self  |  self  |  self |   self
-- users    DELETE     |   ✓   |    -    |    -   |   -   |    -
--
-- clients  SELECT     |   ✓   |    ✓    |    ✓   |   ✓   |    ✓
-- clients  INSERT     |   ✓   |    ✓    |    -   |   -   |    -
-- clients  UPDATE     |   ✓   |    ✓    |    -   |   -   |    -
-- clients  DELETE     |   ✓   |    -    |    -   |   -   |    -
--
-- projects SELECT     |   ✓   |  membro | membro | membro|  membro
-- projects INSERT     |   ✓   |    ✓    |    ✓   |   -   |    -
-- projects UPDATE     |   ✓   |  líder  |  líder |  líder|    -
-- projects DELETE     |   ✓   |    -    |    -   |   -   |    -
--
-- project_members     |   ✓   |  líder  |  líder |  líder|  read-only
-- project_phases      |   ✓   |  líder  |  líder |  líder|  read-only
-- external_approvals  |   ✓   |  membro | membro | membro|  membro
-- arts                |   ✓   |  líder  |  líder |  líder|  read-only
-- document_revisions  |   ✓   |  membro | membro | membro|  membro (próprias)
-- tasks               |   ✓   |  membro | membro | membro|  próprias
-- messages            |   ✓   |  membro | membro | membro|  próprias
-- meeting_rooms       |   ✓   |    ✓    |   read |  read |   read
-- meetings            |   ✓   |  próprias              (qualquer um cria)
-- ============================================================================
