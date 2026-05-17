import * as XLSX from "xlsx";

export type ImportKind = "atestados" | "cats" | "profissionais" | "licitacoes";

const ATTEST_COLS = [
  "nome_atestado",
  "empresa",
  "orgao_cliente",
  "cidade",
  "estado",
  "objeto",
  "descricao_servicos",
  "tipo_atestado",
  "area_tecnica",
  "data_emissao",
  "inicio_execucao",
  "fim_execucao",
  "valor_contrato",
  "responsavel_tecnico",
  "numero_cat",
  "observacoes",
] as const;

export function downloadContratosTemplate(kind: ImportKind) {
  let headers: string[] = [];
  let example: Record<string, string | number> = {};
  switch (kind) {
    case "atestados":
      headers = [...ATTEST_COLS];
      example = {
        nome_atestado: "Atestado de obras de esgotamento",
        empresa: "Minha Engenharia LTDA",
        orgao_cliente: "Prefeitura X",
        cidade: "Leopoldina",
        estado: "MG",
        objeto: "Ampliação da rede de esgoto",
        descricao_servicos: "Projeto executivo e fiscalização",
        tipo_atestado: "Saneamento",
        area_tecnica: "Esgotamento Sanitário",
        data_emissao: "2024-06-01",
        inicio_execucao: "2023-01-10",
        fim_execucao: "2023-12-15",
        valor_contrato: 1500000,
        responsavel_tecnico: "Eng. Fulano",
        numero_cat: "CAT-12345",
        observacoes: "",
      };
      break;
    case "cats":
      headers = [
        "numero_cat",
        "conselho",
        "estado",
        "profissional_nome",
        "empresa",
        "objeto_tecnico",
        "tipo_servico",
        "data_emissao",
        "pdf_url",
        "observacoes",
      ];
      example = {
        numero_cat: "MG-987654",
        conselho: "CREA",
        estado: "MG",
        profissional_nome: "Eng. Fulano",
        empresa: "Minha Engenharia LTDA",
        objeto_tecnico: "Projeto de redes",
        tipo_servico: "Saneamento",
        data_emissao: "2024-01-15",
        pdf_url: "",
        observacoes: "",
      };
      break;
    case "profissionais":
      headers = [
        "nome_completo",
        "cargo",
        "formacao",
        "crea",
        "estado_registro",
        "especialidade",
        "vinculo",
        "disponibilidade",
        "status",
        "observacoes",
      ];
      example = {
        nome_completo: "Eng. Fulano da Silva",
        cargo: "Projetista sênior",
        formacao: "Eng. Civil",
        crea: "MG-123",
        estado_registro: "MG",
        especialidade: "Hidráulica",
        vinculo: "CLT",
        disponibilidade: "disponivel",
        status: "ativo",
        observacoes: "",
      };
      break;
    case "licitacoes":
      headers = [
        "nome",
        "orgao",
        "cidade",
        "estado",
        "edital",
        "modalidade",
        "objeto",
        "data_publicacao",
        "prazo_proposta",
        "sessao",
        "valor_estimado",
        "status",
        "tipos_servico_csv",
        "palavras_chave",
        "observacoes",
      ];
      example = {
        nome: "Pregão eletrônico 045/2026",
        orgao: "Órgão Y",
        cidade: "Belo Horizonte",
        estado: "MG",
        edital: "045/2026",
        modalidade: "Pregão",
        objeto: "Contratação de empresa para projetos BIM em saneamento",
        data_publicacao: "2026-03-01",
        prazo_proposta: "2026-03-20T14:00:00",
        sessao: "2026-03-25",
        valor_estimado: 2000000,
        status: "em_analise",
        tipos_servico_csv: "BIM,Saneamento",
        palavras_chave: "esgotamento BIM",
        observacoes: "",
      };
      break;
  }

  const ws = XLSX.utils.json_to_sheet([example], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo");
  XLSX.writeFile(wb, `modelo_import_${kind}.xlsx`);
}

export function parseExcelToRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const first = wb.SheetNames[0];
        const sheet = wb.Sheets[first];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

export function exportRowsToExcel(filename: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
