/**
 * Caminho publico da logo da empresa (servida pelo Next.js do diretorio /public).
 * Substitui qualquer referencia anterior a "HydraCode".
 */
export const COMPANY_LOGO_SRC = "/company-logo.png";

let cachedLogoDataUrl: string | null = null;
let inflight: Promise<string | null> | null = null;

/**
 * Carrega a logo da empresa como data URL (base64) para embutir em PDFs.
 * Faz cache em memoria para evitar fetch repetido na mesma sessao.
 * Retorna null se nao for possivel carregar (offline, asset removido, etc.).
 */
export async function loadCompanyLogoDataUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(COMPANY_LOGO_SRC, { cache: "force-cache" });
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      cachedLogoDataUrl = dataUrl;
      return dataUrl;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
