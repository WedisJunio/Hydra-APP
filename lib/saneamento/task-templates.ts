export type SystemTemplateType =
  | "SAA"
  | "SES"
  | "DRENAGEM"
  | "ETA"
  | "ETE"
  | "ELEVATORIA"
  | "OUTRO";

export const SYSTEM_TYPE_LABEL: Record<SystemTemplateType, string> = {
  SAA: "SAA",
  SES: "SES",
  DRENAGEM: "Drenagem",
  ETA: "ETA",
  ETE: "ETE",
  ELEVATORIA: "Elevatória",
  OUTRO: "Outro",
};
