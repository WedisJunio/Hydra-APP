import type { ApprovalStatus } from "./types";

// Órgãos comuns em projetos de saneamento e tipos de aprovação típicos.
// Servem como sugestões nos selects da UI — o usuário pode digitar livremente.

export type AgencyOption = {
  code: string;
  name: string;
  description?: string;
};

export const COMMON_AGENCIES: AgencyOption[] = [
  { code: "COPASA", name: "COPASA", description: "Concessionária de saneamento — MG" },
  { code: "CAJ", name: "CAJ", description: "Concessionária parceira" },
  { code: "SABESP", name: "SABESP", description: "Concessionária — SP" },
  { code: "SANEPAR", name: "SANEPAR", description: "Concessionária — PR" },
  { code: "CASAN", name: "CASAN", description: "Concessionária — SC" },
  { code: "EMBASA", name: "EMBASA", description: "Concessionária — BA" },
  { code: "CESAN", name: "CESAN", description: "Concessionária — ES" },
  { code: "CAESB", name: "CAESB", description: "Concessionária — DF" },
  { code: "IGAM", name: "IGAM", description: "Outorga de recursos hídricos — MG" },
  { code: "ANA", name: "ANA", description: "Agência Nacional de Águas" },
  { code: "IBAMA", name: "IBAMA", description: "Licenciamento federal" },
  { code: "SEMAD", name: "SEMAD", description: "Licenciamento estadual — MG" },
  { code: "PREFEITURA", name: "Prefeitura", description: "Alvará / canteiro" },
  { code: "DER", name: "DER", description: "Travessia de rodovia estadual" },
  { code: "DNIT", name: "DNIT", description: "Travessia de rodovia federal" },
  { code: "BOMBEIROS", name: "Corpo de Bombeiros", description: "PCI em ETA/ETE" },
];

export type ApprovalTypeOption = {
  code: string;
  name: string;
  defaultDays?: number;
};

export const APPROVAL_TYPES: ApprovalTypeOption[] = [
  { code: "viabilidade", name: "Viabilidade técnica", defaultDays: 30 },
  { code: "analise_basico", name: "Análise de Projeto Básico", defaultDays: 60 },
  { code: "analise_executivo", name: "Análise de Projeto Executivo", defaultDays: 60 },
  { code: "outorga_captacao", name: "Outorga de captação", defaultDays: 90 },
  { code: "outorga_lancamento", name: "Outorga de lançamento", defaultDays: 90 },
  { code: "lp", name: "Licença Prévia (LP)", defaultDays: 120 },
  { code: "li", name: "Licença de Instalação (LI)", defaultDays: 120 },
  { code: "lo", name: "Licença de Operação (LO)", defaultDays: 90 },
  { code: "aaf", name: "AAF — Autorização Ambiental", defaultDays: 60 },
  { code: "alvara", name: "Alvará / canteiro", defaultDays: 30 },
  { code: "travessia", name: "Travessia rodoviária", defaultDays: 60 },
  { code: "outro", name: "Outro" },
];

export const approvalStatusLabel: Record<ApprovalStatus, string> = {
  in_preparation: "Em preparação",
  submitted: "Protocolada",
  in_analysis: "Em análise",
  in_diligence: "Em diligência",
  approved: "Aprovada",
  rejected: "Reprovada",
  cancelled: "Cancelada",
};

export const approvalStatusVariant: Record<
  ApprovalStatus,
  "neutral" | "info" | "warning" | "success" | "danger" | "primary"
> = {
  in_preparation: "neutral",
  submitted: "primary",
  in_analysis: "info",
  in_diligence: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/** Calcula dias úteis simples (dias corridos) entre 2 datas. */
export function daysBetween(a: string | Date, b: string | Date) {
  const ms =
    new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Calcula a data esperada de resposta a partir de submissão + prazo. */
export function expectedResponseDate(
  submittedDate: string | null,
  expectedDays: number | null
): string | null {
  if (!submittedDate || !expectedDays) return null;
  const d = new Date(submittedDate + "T00:00:00");
  d.setDate(d.getDate() + expectedDays);
  return d.toISOString().slice(0, 10);
}
