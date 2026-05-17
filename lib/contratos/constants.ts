/** Tipos de serviço / atestado — expansível. */
export const CONTRACT_SERVICE_TYPES = [
  "BIM",
  "Estrutural",
  "Saneamento",
  "Abastecimento de Água",
  "Esgotamento Sanitário",
  "Drenagem",
  "Pavimentação",
  "Arquitetura",
  "Elétrico",
  "Hidráulico",
  "Orçamento",
  "Fiscalização",
  "Projeto Executivo",
  "Projeto Básico",
  "Modelagem",
  "Compatibilização",
  "Urbanismo",
  "Topografia",
  "Geotecnia",
  "Outro",
] as const;

export const LICITACAO_STATUS = [
  "em_analise",
  "aguardando_documentos",
  "equipe_pendente",
  "atestados_pendentes",
  "pronta_participar",
  "participando",
  "vencida",
  "perdida",
  "cancelada",
  "concluida",
] as const;

export type LicitacaoStatus = (typeof LICITACAO_STATUS)[number];

export const LICITACAO_STATUS_LABEL: Record<LicitacaoStatus, string> = {
  em_analise: "Em análise",
  aguardando_documentos: "Aguardando documentos",
  equipe_pendente: "Equipe pendente",
  atestados_pendentes: "Atestados pendentes",
  pronta_participar: "Pronta para participar",
  participando: "Participando",
  vencida: "Vencida",
  perdida: "Perdida",
  cancelada: "Cancelada",
  concluida: "Concluída",
};

export const DOC_STATUS_ATTEST_LABEL: Record<string, string> = {
  ok: "Regular",
  pendente: "Pendente",
  vencido: "Vencido",
  sem_arquivo: "Sem arquivo",
};

export const DOC_STATUS_CAT_LABEL: Record<string, string> = {
  valida: "Válida",
  pendente: "Pendente",
  vencida: "Vencida",
  sem_arquivo: "Sem arquivo",
};

export const PRO_AVAILABILITY_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  indisponivel: "Indisponível",
  parcial: "Parcial",
};
