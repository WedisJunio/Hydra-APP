// Gera docs/Apresentacao-Premium.pdf a partir do conteudo do roteiro.
// Executar: node scripts/generate-apresentacao-pdf.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");
const outDir = join(root, "docs");
const outPath = join(outDir, "Apresentacao-Premium.pdf");

mkdirSync(outDir, { recursive: true });

const COLORS = {
  primary: [37, 99, 235],
  primarySoft: [219, 234, 254],
  text: [15, 23, 42],
  muted: [100, 116, 139],
  border: [226, 232, 240],
  accent: [16, 163, 127],
  warning: [217, 119, 6],
  bgSoft: [248, 250, 252],
};

const PAGE = {
  width: 210,
  height: 297,
  margin: 18,
};
const CONTENT_W = PAGE.width - PAGE.margin * 2;

const doc = new jsPDF({ unit: "mm", format: "a4" });

// Capa
function drawCover() {
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE.width, PAGE.height, "F");

  doc.setFillColor(255, 255, 255, 0.06);
  doc.circle(PAGE.width - 30, 30, 70, "F");
  doc.circle(20, PAGE.height - 50, 90, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.text("Hydra", PAGE.margin, 70);

  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.text("Plataforma operacional de projetos", PAGE.margin, 80);

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.line(PAGE.margin, 90, PAGE.margin + 40, 90);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("Apresentacao", PAGE.margin, 120);
  doc.text("Premium", PAGE.margin, 134);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(
    "Checklist + Roteiro + Q&A para reuniao com cliente",
    PAGE.margin,
    150
  );

  doc.setFontSize(10);
  doc.text("Documento interno - uso comercial", PAGE.margin, PAGE.height - 22);
  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(`Atualizado em: ${today}`, PAGE.margin, PAGE.height - 16);
}

function ensureSpace(cursorY, needed) {
  if (cursorY + needed > PAGE.height - 22) {
    doc.addPage();
    drawHeader();
    return PAGE.margin + 18;
  }
  return cursorY;
}

function drawHeader() {
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE.width, 10, "F");

  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Hydra - Apresentacao Premium", PAGE.margin, 16);
}

function drawFooter(pageNumber) {
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.line(
    PAGE.margin,
    PAGE.height - 14,
    PAGE.width - PAGE.margin,
    PAGE.height - 14
  );

  doc.setTextColor(...COLORS.muted);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Hydra (c) 2026", PAGE.margin, PAGE.height - 8);
  doc.text(
    `Pagina ${pageNumber}`,
    PAGE.width - PAGE.margin,
    PAGE.height - 8,
    { align: "right" }
  );
}

function sectionTitle(cursorY, title, subtitle) {
  cursorY = ensureSpace(cursorY, 24);
  doc.setFillColor(...COLORS.primarySoft);
  doc.roundedRect(PAGE.margin, cursorY, CONTENT_W, 14, 3, 3, "F");

  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, PAGE.margin + 4, cursorY + 9);

  cursorY += 18;

  if (subtitle) {
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text(subtitle, PAGE.margin, cursorY);
    cursorY += 6;
  }
  return cursorY;
}

function paragraph(cursorY, text, opts = {}) {
  doc.setTextColor(...COLORS.text);
  doc.setFont("helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(opts.size ?? 10.5);
  const lines = doc.splitTextToSize(text, CONTENT_W);
  cursorY = ensureSpace(cursorY, lines.length * 5 + 2);
  doc.text(lines, PAGE.margin, cursorY);
  return cursorY + lines.length * 5 + 2;
}

function quote(cursorY, text) {
  const lines = doc.splitTextToSize(text, CONTENT_W - 10);
  const blockH = lines.length * 5 + 6;
  cursorY = ensureSpace(cursorY, blockH + 4);

  doc.setFillColor(...COLORS.bgSoft);
  doc.roundedRect(PAGE.margin, cursorY, CONTENT_W, blockH, 2, 2, "F");
  doc.setFillColor(...COLORS.primary);
  doc.rect(PAGE.margin, cursorY, 1.6, blockH, "F");

  doc.setTextColor(...COLORS.text);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10.5);
  doc.text(lines, PAGE.margin + 6, cursorY + 6);

  return cursorY + blockH + 3;
}

function checklist(cursorY, items) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  for (const item of items) {
    cursorY = ensureSpace(cursorY, 7);
    doc.setDrawColor(...COLORS.muted);
    doc.setLineWidth(0.3);
    doc.roundedRect(PAGE.margin, cursorY - 3.6, 4, 4, 0.6, 0.6);

    doc.setTextColor(...COLORS.text);
    const lines = doc.splitTextToSize(item, CONTENT_W - 8);
    doc.text(lines, PAGE.margin + 7, cursorY);
    cursorY += lines.length * 5 + 2;
  }
  return cursorY + 2;
}

function bulletList(cursorY, items) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  for (const item of items) {
    cursorY = ensureSpace(cursorY, 7);
    doc.setFillColor(...COLORS.primary);
    doc.circle(PAGE.margin + 1.5, cursorY - 1.6, 0.9, "F");

    doc.setTextColor(...COLORS.text);
    const lines = doc.splitTextToSize(item, CONTENT_W - 6);
    doc.text(lines, PAGE.margin + 5, cursorY);
    cursorY += lines.length * 5 + 1;
  }
  return cursorY + 2;
}

function qa(cursorY, question, answer) {
  cursorY = ensureSpace(cursorY, 18);
  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const qLines = doc.splitTextToSize(`P: ${question}`, CONTENT_W);
  doc.text(qLines, PAGE.margin, cursorY);
  cursorY += qLines.length * 5 + 1;

  doc.setTextColor(...COLORS.text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  const aLines = doc.splitTextToSize(`R: ${answer}`, CONTENT_W);
  doc.text(aLines, PAGE.margin, cursorY);
  cursorY += aLines.length * 5 + 4;

  return cursorY;
}

drawCover();

// Pagina 2 - Sumario
doc.addPage();
drawHeader();
let y = PAGE.margin + 18;

doc.setTextColor(...COLORS.text);
doc.setFont("helvetica", "bold");
doc.setFontSize(20);
doc.text("Sumario", PAGE.margin, y);
y += 12;

const summaryItems = [
  "1. Checklist tecnico (antes da reuniao)",
  "2. Checklist de dados de demo",
  "3. Checklist operacional do dia",
  "4. Roteiro de apresentacao (10-12 min)",
  "5. Perguntas e respostas comerciais",
];

doc.setFont("helvetica", "normal");
doc.setFontSize(11.5);
for (const item of summaryItems) {
  doc.setTextColor(...COLORS.text);
  doc.text(item, PAGE.margin, y);
  y += 8;
}

// Pagina(s) - Conteudo
doc.addPage();
drawHeader();
y = PAGE.margin + 18;

y = sectionTitle(y, "1. Checklist tecnico (antes da reuniao)");
y = paragraph(
  y,
  "Aplicar antes da reuniao para garantir estabilidade total e zero falha durante a demonstracao."
);
y = checklist(y, [
  "Aplicar no Supabase: meetings-extra-fields.sql",
  "Aplicar no Supabase: auth-link-fallback.sql",
  "Aplicar no Supabase: fix-auth-link.sql",
  "Aplicar no Supabase: permissions.sql",
  "Logout/Login em todas as contas de teste apos os SQLs",
  "Validar contas: admin e projetista",
  "Testar criacao de reuniao com participantes e lembrete de 15 min",
  "Chat: envio/recebimento em tempo real entre 2 usuarios",
  "Chat: notificacao nativa com aba minimizada",
  "Chat: silenciar grupo / reativar grupo",
  "Tarefas: projetista nao pausa tarefa de terceiros",
  "Tarefas: admin/coordenador/projetista legado conseguem pausar de terceiros",
  "Tarefas: pausa exige motivo",
  "Ponto: clock-out pausa tarefa ativa automaticamente",
  "Ponto: clock-in no dia seguinte retoma tarefa automaticamente",
  "Dashboard sem warnings de grafico no console",
]);

y = sectionTitle(y, "2. Checklist de dados de demo");
y = paragraph(
  y,
  "Massa de dados que vende. Evita tela vazia e mostra a plataforma em ritmo real de operacao."
);
y = checklist(y, [
  "1 projeto com nome de cliente realista (ex.: Residencial Aurora)",
  "1 projeto de saneamento com fases e aprovacoes em aberto",
  "6 a 10 tarefas distribuidas (pendente, em andamento, concluida, atrasada)",
  "2 reunioes no calendario (uma hoje, uma amanha)",
  "Chat com historico coerente",
  "3 usuarios visiveis (admin, coordenador, projetista)",
]);

y = sectionTitle(y, "3. Checklist operacional do dia");
y = checklist(y, [
  "Abrir o sistema 10 minutos antes",
  "Fechar abas desnecessarias do navegador",
  "Login pronto com conta admin",
  "Janela secundaria aberta com conta projetista",
  "Audio e internet testados",
  "Backup gravado em video curto (60-90 s)",
]);

y = sectionTitle(y, "4. Roteiro de apresentacao (10-12 min)");

y = paragraph(y, "Abertura (1 min)", { bold: true, size: 12 });
y = quote(
  y,
  "Hoje vou mostrar como o Hydra centraliza projetos, tarefas, reunioes, ponto e comunicacao em um unico fluxo, com controle de permissao por perfil."
);

y = paragraph(y, "Dor do cliente (1 min)", { bold: true, size: 12 });
y = quote(
  y,
  "Normalmente essas informacoes ficam espalhadas em planilhas, chat e agenda separada. Isso gera atraso, retrabalho e baixa visibilidade para a gestao."
);

y = paragraph(y, "Visao executiva - Dashboard (2 min)", { bold: true, size: 12 });
y = bulletList(y, [
  "Mostrar produtividade da equipe",
  "Mostrar tarefas atrasadas",
  "Mostrar saude das entregas",
  "Destacar bloco de saneamento e leitura rapida de risco",
]);
y = quote(
  y,
  "Em menos de 30 segundos a diretoria sabe onde agir hoje."
);

y = paragraph(y, "Operacao - Projetos + Tarefas (3 min)", {
  bold: true,
  size: 12,
});
y = bulletList(y, [
  "Entrar em Projetos e abrir 1 projeto",
  "Mostrar tarefas com timer, pausa com motivo e mudanca de status",
  "Demonstrar regra: projetista nao altera tarefa de outro responsavel",
]);
y = quote(
  y,
  "A regra operacional impede alteracoes indevidas e aumenta rastreabilidade."
);

y = paragraph(y, "Comunicacao + Reunioes (2 min)", { bold: true, size: 12 });
y = bulletList(y, [
  "No Chat enviar mensagem de uma conta e receber na outra (tempo real + pop-up)",
  "No Calendario criar reuniao com participantes e lembrete de 15 min",
]);
y = quote(
  y,
  "Comunicacao e agenda viram parte do fluxo operacional, nao ferramentas isoladas."
);

y = paragraph(y, "Ponto integrado a producao (1.5 min)", {
  bold: true,
  size: 12,
});
y = bulletList(y, [
  "Mostrar clock-out pausando tarefa ativa automaticamente",
  "Mostrar clock-in retomando tarefa no proximo dia",
]);
y = quote(
  y,
  "A gestao de tempo conversa direto com a execucao das tarefas."
);

y = paragraph(y, "Fechamento (1 min)", { bold: true, size: 12 });
y = quote(
  y,
  "Em resumo: menos retrabalho, mais previsibilidade e governanca por perfil. Se fizer sentido, o proximo passo pode ser um piloto com um time da empresa."
);

y = sectionTitle(y, "5. Perguntas e respostas comerciais");
y = qa(
  y,
  "Consigo controlar quem pode alterar o que?",
  "Sim. A plataforma usa regras por perfil (admin, coordenador, projetista, etc.) e valida tambem no banco de dados, garantindo que regra seja real e nao apenas visual."
);
y = qa(
  y,
  "Tem notificacao mesmo com tela minimizada?",
  "Sim. Com permissao do navegador ativada, chat e reunioes disparam notificacoes nativas mesmo com a aba minimizada."
);
y = qa(
  y,
  "Da para comecar pequeno?",
  "Sim. Recomendamos iniciar com 1 area ou time piloto e expandir por etapas para acelerar adocao."
);
y = qa(
  y,
  "Consegue adaptar ao nosso processo?",
  "Sim. A arquitetura ja contempla ajustes de regra, campos e fluxos por operacao."
);

const totalPages = doc.getNumberOfPages();
for (let i = 2; i <= totalPages; i += 1) {
  doc.setPage(i);
  drawFooter(i - 1);
}

const buffer = Buffer.from(doc.output("arraybuffer"));
writeFileSync(outPath, buffer);
console.log(`PDF gerado em: ${outPath}`);
