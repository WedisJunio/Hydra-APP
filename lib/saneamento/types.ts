// Tipos do módulo de Saneamento.
// Espelha o schema definido em lib/sql/saneamento-schema.sql.

export type ClientType =
  | "concessionaria"
  | "prefeitura"
  | "saae"
  | "governo_federal"
  | "privado"
  | "outro";

export type Client = {
  id: string;
  name: string;
  short_name: string | null;
  type: ClientType;
  cnpj: string | null;
  state: string | null;
  city: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
};

export type SanitationType = "SAA" | "SES" | "SAA_SES";

export type PhaseStatus =
  | "pending"
  | "in_progress"
  | "in_review"
  | "approved"
  | "on_hold"
  | "skipped";

export type ProjectPhase = {
  id: string;
  project_id: string;
  name: string;
  code: string | null;
  order: number;
  status: PhaseStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  notes: string | null;
};

export type ApprovalStatus =
  | "in_preparation"
  | "submitted"
  | "in_analysis"
  | "in_diligence"
  | "approved"
  | "rejected"
  | "cancelled";

export type ExternalApproval = {
  id: string;
  project_id: string;
  agency: string;
  approval_type: string | null;
  process_number: string | null;
  submitted_date: string | null;
  expected_response_days: number | null;
  expected_response_date: string | null;
  actual_response_date: string | null;
  status: ApprovalStatus;
  notes: string | null;
  responsible_user_id: string | null;
  responsible?: { id: string; name: string } | null;
};

export type DocumentRevision = {
  id: string;
  project_id: string;
  document_name: string;
  document_type: string | null;
  revision_code: string;
  description: string | null;
  file_url: string | null;
  author_id: string | null;
  author?: { id: string; name: string } | null;
  created_at: string;
};

export type ArtType = "ART" | "RRT" | "TRT";

export type Art = {
  id: string;
  project_id: string;
  professional_id: string | null;
  professional?: { id: string; name: string } | null;
  art_number: string;
  art_type: ArtType;
  activity_description: string | null;
  issued_date: string | null;
  payment_value: number | null;
  paid: boolean;
  paid_date: string | null;
  notes: string | null;
};

export type SanitationProject = {
  id: string;
  name: string;
  manager_id: string | null;
  coordinator_id: string | null;
  leader_id: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  created_at: string;
  // Saneamento
  discipline: string | null;
  client_id: string | null;
  contract_number: string | null;
  sanitation_type: SanitationType | null;
  municipality: string | null;
  state: string | null;
  design_flow_lps: number | null;
  population_current: number | null;
  population_final: number | null;
  horizon_years: number | null;
  network_length_m: number | null;
  treatment_system: string | null;
  contract_value: number | null;
  notes: string | null;
};

export const sanitationTypeLabel: Record<SanitationType, string> = {
  SAA: "Sistema de Abastecimento de Água",
  SES: "Sistema de Esgotamento Sanitário",
  SAA_SES: "SAA + SES (integrado)",
};

export const sanitationTypeShort: Record<SanitationType, string> = {
  SAA: "SAA",
  SES: "SES",
  SAA_SES: "SAA+SES",
};

// ─── Diário de projeto ─────────────────────────────────────────────────────

export type JournalCategory =
  | "progresso"
  | "bloqueio"
  | "diligencia"
  | "reuniao"
  | "visita"
  | "comunicacao"
  | "outro";

export type JournalEntry = {
  id: string;
  project_id: string;
  task_id: string | null;
  phase_id: string | null;
  author_id: string | null;
  author?: { id: string; name: string } | null;
  entry_date: string;
  category: JournalCategory;
  title: string | null;
  content: string;
  hours_worked: number | null;
  created_at: string;
  updated_at: string;
};

export const journalCategoryLabel: Record<JournalCategory, string> = {
  progresso: "Avanço",
  bloqueio: "Bloqueio",
  diligencia: "Diligência",
  reuniao: "Reunião",
  visita: "Visita técnica",
  comunicacao: "Comunicação",
  outro: "Outro",
};

export const journalCategoryDescription: Record<JournalCategory, string> = {
  progresso: "Avanço técnico ou entrega",
  bloqueio: "Algo está travando o andamento",
  diligencia: "Exigência da concessionária/órgão",
  reuniao: "Reunião com cliente, equipe ou órgão",
  visita: "Visita técnica em campo",
  comunicacao: "E-mail, ofício ou telefonema relevante",
  outro: "Outro tipo de registro",
};

export const journalCategoryVariant: Record<
  JournalCategory,
  "neutral" | "info" | "warning" | "success" | "danger" | "primary"
> = {
  progresso: "success",
  bloqueio: "danger",
  diligencia: "warning",
  reuniao: "info",
  visita: "info",
  comunicacao: "primary",
  outro: "neutral",
};
