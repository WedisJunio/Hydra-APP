-- ============================================================================
-- HYDRACODE — MIGRATION DE SANEAMENTO
-- ============================================================================
-- Este arquivo cria/estende as tabelas necessárias para o módulo de
-- Projetos de Saneamento (SAA / SES) no produto.
--
-- Como usar:
-- 1. Abrir o Supabase Studio do projeto
-- 2. Ir em SQL Editor → New query
-- 3. Colar este arquivo inteiro e clicar em Run
-- 4. Os dados existentes em "projects" continuam funcionando — só estamos
--    adicionando colunas e tabelas novas. Nada destrutivo.
-- ============================================================================

-- ─── CLIENTS / CONCESSIONÁRIAS ─────────────────────────────────────────────
-- Centraliza concessionárias (COPASA, CAJ, Sabesp...) e prefeituras /
-- contratantes em geral. Todo projeto de saneamento aponta pra um.

CREATE TABLE IF NOT EXISTS clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    short_name      TEXT,
    type            TEXT NOT NULL DEFAULT 'concessionaria'
                    CHECK (type IN (
                      'concessionaria',
                      'prefeitura',
                      'saae',
                      'governo_federal',
                      'privado',
                      'outro'
                    )),
    cnpj            TEXT,
    state           CHAR(2),
    city            TEXT,
    contact_name    TEXT,
    contact_email   TEXT,
    contact_phone   TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_short_name_idx ON clients (short_name);
CREATE INDEX IF NOT EXISTS clients_state_idx      ON clients (state);

-- ─── EXTENSÕES NA TABELA PROJECTS ──────────────────────────────────────────
-- Adicionamos campos opcionais para projetos de saneamento. Projetos antigos
-- e de outras disciplinas continuam funcionando normalmente.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS discipline        TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id         UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_number   TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sanitation_type   TEXT
    CHECK (sanitation_type IS NULL OR sanitation_type IN ('SAA', 'SES', 'SAA_SES'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS municipality      TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state             CHAR(2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS design_flow_lps   NUMERIC;     -- vazão de projeto em l/s
ALTER TABLE projects ADD COLUMN IF NOT EXISTS population_current INTEGER;    -- pop. atendida hoje
ALTER TABLE projects ADD COLUMN IF NOT EXISTS population_final  INTEGER;     -- pop. fim de plano
ALTER TABLE projects ADD COLUMN IF NOT EXISTS horizon_years     INTEGER;     -- horizonte (10/20 anos)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS network_length_m  NUMERIC;     -- extensão de rede
ALTER TABLE projects ADD COLUMN IF NOT EXISTS treatment_system  TEXT;        -- ex: 'UASB', 'Lodos ativados', 'Convencional'
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_value    NUMERIC;     -- valor do contrato (R$)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes             TEXT;

CREATE INDEX IF NOT EXISTS projects_discipline_idx ON projects (discipline);
CREATE INDEX IF NOT EXISTS projects_client_idx     ON projects (client_id);

-- ─── PROJECT PHASES (etapas técnicas do projeto) ───────────────────────────
-- Concepção → Levantamentos → Básico → Aprovação → Licenciamento →
-- Outorga → Executivo → Aprovação Final → Entrega.

CREATE TABLE IF NOT EXISTS project_phases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    code                TEXT,
    "order"             INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending',
                          'in_progress',
                          'in_review',
                          'approved',
                          'on_hold',
                          'skipped'
                        )),
    planned_start_date  DATE,
    planned_end_date    DATE,
    actual_start_date   DATE,
    actual_end_date     DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS phases_project_idx ON project_phases (project_id);
CREATE INDEX IF NOT EXISTS phases_status_idx  ON project_phases (status);

-- ─── EXTERNAL APPROVALS (aprovações externas com órgão) ────────────────────
-- Concessionária, IBAMA/Sema, IGAM, ANA, prefeitura, DER... Cada submissão é
-- uma linha. Permite controlar protocolo, prazo médio e situação atual.

CREATE TABLE IF NOT EXISTS external_approvals (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id               UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agency                   TEXT NOT NULL,           -- 'COPASA', 'IGAM', 'IBAMA', 'PREFEITURA', etc.
    approval_type            TEXT,                    -- 'analise_basico', 'outorga_captacao', 'lp', etc.
    process_number           TEXT,                    -- nº de processo externo
    submitted_date           DATE,
    expected_response_days   INTEGER,
    expected_response_date   DATE,
    actual_response_date     DATE,
    status                   TEXT NOT NULL DEFAULT 'in_preparation'
                             CHECK (status IN (
                               'in_preparation',
                               'submitted',
                               'in_analysis',
                               'in_diligence',
                               'approved',
                               'rejected',
                               'cancelled'
                             )),
    notes                    TEXT,
    responsible_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approvals_project_idx ON external_approvals (project_id);
CREATE INDEX IF NOT EXISTS approvals_status_idx  ON external_approvals (status);
CREATE INDEX IF NOT EXISTS approvals_agency_idx  ON external_approvals (agency);

-- ─── DOCUMENT REVISIONS (R0, R1, R2 de pranchas e memoriais) ───────────────

CREATE TABLE IF NOT EXISTS document_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_name   TEXT NOT NULL,
    document_type   TEXT,                              -- 'memorial_descritivo', 'memorial_calculo', 'planta', 'planilha_orcamentaria', etc.
    revision_code   TEXT NOT NULL DEFAULT 'R0',        -- R0, R1, R2, ...
    description     TEXT,
    file_url        TEXT,
    author_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS revisions_project_idx ON document_revisions (project_id);

-- ─── ART / RRT / TRT (responsabilidade técnica) ────────────────────────────

CREATE TABLE IF NOT EXISTS arts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id             UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    professional_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    art_number             TEXT NOT NULL,
    art_type               TEXT NOT NULL DEFAULT 'ART'
                           CHECK (art_type IN ('ART', 'RRT', 'TRT')),
    activity_description   TEXT,
    issued_date            DATE,
    payment_value          NUMERIC,
    paid                   BOOLEAN NOT NULL DEFAULT FALSE,
    paid_date              DATE,
    notes                  TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arts_project_idx ON arts (project_id);

-- ─── SEED DAS CONCESSIONÁRIAS PRINCIPAIS ───────────────────────────────────

INSERT INTO clients (name, short_name, type, state)
VALUES
    ('Companhia de Saneamento de Minas Gerais', 'COPASA', 'concessionaria', 'MG'),
    ('Companhia Águas de Joinville',            'CAJ',    'concessionaria', 'SC')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- FIM
-- ============================================================================
