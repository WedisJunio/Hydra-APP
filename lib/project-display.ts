export type ProjectForDisplayName = {
  name: string;
  municipality?: string | null;
  state?: string | null;
};

/**
 * Título para exibir em cards, filtros e PDFs quando houver cidade/UF.
 * Formato: "Nome do projeto - Leopoldina/MG"
 */
export function formatProjectDisplayName(p: ProjectForDisplayName): string {
  const base = (p.name || "").trim();
  const mun = (p.municipality ?? "").trim();
  const uf = (p.state ?? "").trim().toUpperCase();

  let suffix = "";
  if (mun && uf) suffix = `${mun}/${uf}`;
  else if (mun) suffix = mun;
  else if (uf) suffix = uf;

  if (!suffix) return base;
  if (!base) return suffix;
  return `${base} - ${suffix}`;
}
