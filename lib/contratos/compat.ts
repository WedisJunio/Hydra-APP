import type { ContractAtestado, ContractCat, ContractLicitacao, ContractProfessional, LicitacaoRequirements } from "./types";

export type CompatLevel = "alta" | "media" | "baixa";

export type CompatibilityResult = {
  level: CompatLevel;
  score01: number;
  matchingAtestados: ContractAtestado[];
  matchingCats: ContractCat[];
  availableProfessionals: ContractProfessional[];
  busyProfessionals: { professional: ContractProfessional; otherTitles: string[] }[];
  missingRequirements: string[];
  narrative: string;
};

function norm(s: string | null | undefined) {
  return (s || "").toLowerCase().trim();
}

function reqFromLicitacao(lic: ContractLicitacao): LicitacaoRequirements {
  const raw = lic.requirements_json;
  if (!raw || typeof raw !== "object") return {};
  return raw as LicitacaoRequirements;
}

/** Análise heurística de aderência ao edital (requisitos em JSON + texto objeto). */
export function analyzeLicitacaoCompatibility(
  lic: ContractLicitacao,
  atestados: ContractAtestado[],
  cats: ContractCat[],
  professionals: ContractProfessional[],
  licitacoes: ContractLicitacao[],
  membersByLicitacao: Map<string, Set<string>>
): CompatibilityResult {
  const req = reqFromLicitacao(lic);
  const wantedTypes = (req.service_types || []).map(norm).filter(Boolean);
  const keywords = norm([req.keywords, lic.object_text].filter(Boolean).join(" "));
  const missing: string[] = [];

  const matchAtestado = (a: ContractAtestado) => {
    const st = norm(a.service_type);
    const area = norm(a.technical_area);
    const blob = norm(`${a.contract_object} ${a.services_description} ${a.title}`);
    const typeOk =
      wantedTypes.length === 0 || wantedTypes.some((w) => st.includes(w) || area.includes(w));
    const keyOk =
      !keywords ||
      keywords.split(/\s+/).some((k) => k.length > 2 && blob.includes(k));
    return typeOk && keyOk;
  };

  const matchingAtestados = atestados.filter(matchAtestado);
  if (wantedTypes.length > 0 && matchingAtestados.length === 0) {
    missing.push("Nenhum atestado claramente alinhado aos tipos de serviço exigidos.");
  }

  const matchCat = (c: ContractCat) => {
    const st = norm(c.service_type);
    const typeOk =
      wantedTypes.length === 0 || wantedTypes.some((w) => st.includes(w));
    const obj = norm(c.technical_object);
    const keyOk =
      !keywords ||
      keywords.split(/\s+/).some((k) => k.length > 2 && obj.includes(k));
    return typeOk && keyOk;
  };

  const matchingCats = cats.filter(matchCat);

  const blockingOther = (other: ContractLicitacao) =>
    ["participando", "pronta_participar", "em_analise", "aguardando_documentos"].includes(other.status);

  const busy: CompatibilityResult["busyProfessionals"] = [];
  const licById = new Map(licitacoes.map((l) => [l.id, l]));

  for (const p of professionals.filter((x) => x.status === "ativo")) {
    const conflicts: string[] = [];
    for (const [lid, set] of membersByLicitacao) {
      if (lid === lic.id || !set.has(p.id)) continue;
      const other = licById.get(lid);
      if (other && blockingOther(other)) {
        conflicts.push(other.title || `Licitação ${lid.slice(0, 8)}`);
      }
    }
    if (conflicts.length > 0) {
      busy.push({ professional: p, otherTitles: conflicts });
    }
  }

  const available = professionals.filter(
    (p) => p.status === "ativo" && !busy.some((b) => b.professional.id === p.id) && p.availability === "disponivel"
  );

  let score = 0.35;
  if (matchingAtestados.length > 0) score += 0.25;
  if (matchingAtestados.length > 2) score += 0.1;
  if (matchingCats.length > 0) score += 0.15;
  if (available.length > 0) score += 0.15;
  if (busy.length > matchingAtestados.length) score -= 0.1;

  if (!lic.internal_responsible_id) {
    missing.push("Defina um responsável interno na licitação.");
    score -= 0.08;
  }

  score = Math.max(0, Math.min(1, score));

  let level: CompatLevel = "baixa";
  if (score >= 0.72) level = "alta";
  else if (score >= 0.48) level = "media";

  const narrativeParts = [
    `Compatibilidade estimada em nível ${level === "alta" ? "alto" : level === "media" ? "médio" : "baixo"} (escore interno ${Math.round(score * 100)}%).`,
    `Encontrados ${matchingAtestados.length} atestado(s) e ${matchingCats.length} CAT(s) potencialmente relacionados.`,
    `Profissionais com folga aparente: ${available.length}. Possíveis sobreposições de alocação: ${busy.length}.`,
  ];
  if (missing.length) {
    narrativeParts.push(`Pendências: ${missing.join(" ")}`);
  }

  return {
    level,
    score01: score,
    matchingAtestados,
    matchingCats,
    availableProfessionals: available,
    busyProfessionals: busy,
    missingRequirements: missing,
    narrative: narrativeParts.join(" "),
  };
}
