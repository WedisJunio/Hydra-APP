import type { PhaseStatus } from "./types";

// Templates de etapas padrão para projetos de saneamento (só projeto, sem
// execução de obra). Baseado no fluxo típico das concessionárias estaduais
// brasileiras (COPASA, Sabesp, Sanepar, etc.).

export type PhaseTemplate = {
  code: string;
  name: string;
  description?: string;
  optional?: boolean;
};

export const SANEAMENTO_PHASE_TEMPLATE: PhaseTemplate[] = [
  {
    code: "concepcao",
    name: "Estudo de Concepção",
    description:
      "Análise de alternativas técnicas e definição do partido geral do projeto.",
  },
  {
    code: "levantamentos",
    name: "Levantamentos de Campo",
    description: "Topografia, sondagem geotécnica e cadastro de redes existentes.",
  },
  {
    code: "projeto_basico",
    name: "Projeto Básico",
    description: "Anteprojeto detalhado com memorial e quantitativos.",
  },
  {
    code: "aprovacao_basico",
    name: "Aprovação do Básico (Concessionária)",
    description: "Submissão e análise do projeto básico pela concessionária.",
  },
  {
    code: "licenciamento_ambiental",
    name: "Licenciamento Ambiental",
    description: "LP / LI junto ao órgão estadual ou IBAMA. Pode ser dispensado em obras menores.",
    optional: true,
  },
  {
    code: "outorga",
    name: "Outorga de Recursos Hídricos",
    description: "Outorga de captação ou de lançamento (ANA / IGAM / SEMA).",
    optional: true,
  },
  {
    code: "projeto_executivo",
    name: "Projeto Executivo",
    description: "Detalhamento final com memorial, especificações e planilha orçamentária.",
  },
  {
    code: "aprovacao_executivo",
    name: "Aprovação do Executivo (Concessionária)",
    description: "Análise final do executivo e liberação para licitação/obra.",
  },
  {
    code: "entrega_final",
    name: "Entrega Final",
    description: "Compilação dos documentos definitivos para o contratante.",
  },
];

export const phaseStatusLabel: Record<PhaseStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  in_review: "Em análise",
  approved: "Aprovada",
  on_hold: "Em espera",
  skipped: "Não aplicável",
};

export const phaseStatusVariant: Record<
  PhaseStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  pending: "neutral",
  in_progress: "info",
  in_review: "warning",
  approved: "success",
  on_hold: "warning",
  skipped: "neutral",
};
