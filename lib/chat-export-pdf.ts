import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ChatPdfMessage = {
  created_at: string;
  content: string;
  users?: { name?: string | null } | null;
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const FOOTER_Y = PAGE_H - 8;

function safeFileSlug(title: string): string {
  const s = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55);
  return s || "canal";
}

function sanitizeCell(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "  ")
    .trim();
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateCell(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTimeCell(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateHeading(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type TableBody = (
  | string
  | {
      content: string;
      colSpan?: number;
      rowSpan?: number;
      styles?: Record<string, unknown>;
    }
)[][];

function buildTableBody(messages: ChatPdfMessage[]): TableBody {
  const rows: TableBody = [];
  let lastKey = "";

  for (const m of messages) {
    const key = localDateKey(m.created_at);
    if (key !== lastKey) {
      lastKey = key;
      rows.push([
        {
          content: formatDateHeading(m.created_at),
          colSpan: 3,
          styles: {
            fillColor: [241, 245, 249],
            textColor: [30, 41, 59],
            fontStyle: "bold",
            halign: "center",
            valign: "middle",
            fontSize: 8.5,
            cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
          },
        },
      ]);
    }

    const author = m.users?.name?.trim() || "—";
    const content = sanitizeCell(m.content || "");
    const displayContent = content.length > 0 ? content : "(sem texto)";

    rows.push([
      `${formatDateCell(m.created_at)} ${formatTimeCell(m.created_at)}`,
      author,
      displayContent,
    ]);
  }

  return rows;
}

function summaryRange(messages: ChatPdfMessage[]): string {
  if (messages.length === 0) return "Sem mensagens";
  const first = new Date(messages[0].created_at);
  const last = new Date(messages[messages.length - 1].created_at);
  const sameDay = localDateKey(messages[0].created_at) === localDateKey(messages[messages.length - 1].created_at);

  const firstLabel = first.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const lastLabel = last.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  if (sameDay) return firstLabel;
  return `${firstLabel} até ${lastLabel}`;
}

function uniqueAuthorsCount(messages: ChatPdfMessage[]): number {
  const names = new Set<string>();
  for (const m of messages) {
    const n = (m.users?.name || "").trim();
    if (n) names.add(n);
  }
  return names.size;
}

function drawTopMetaCard(
  doc: jsPDF,
  opts: {
    channelTitle: string;
    groupTypeLabel: string;
    messages: ChatPdfMessage[];
    exportedBy?: string | null;
  }
) {
  const { channelTitle, groupTypeLabel, messages, exportedBy } = opts;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(MARGIN, 27, PAGE_W - MARGIN * 2, 30, 2.2, 2.2, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const leftX = MARGIN + 4;
  let y = 33;
  const titleLine = `Canal: ${channelTitle}`;
  const splitTitle = doc.splitTextToSize(titleLine, 120);
  doc.text(splitTitle, leftX, y);
  y += splitTitle.length * 4.4;
  doc.text(`Tipo: ${groupTypeLabel}`, leftX, y);
  y += 4.6;
  if (exportedBy) {
    doc.text(`Exportado por: ${exportedBy}`, leftX, y);
  }

  const rightX = PAGE_W - MARGIN - 4;
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.text("Mensagens", rightX - 26, 34, { align: "right" });
  doc.text("Participantes", rightX - 26, 42, { align: "right" });
  doc.text("Período", rightX - 26, 50, { align: "right" });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(String(messages.length), rightX, 34, { align: "right" });
  doc.text(String(uniqueAuthorsCount(messages)), rightX, 42, { align: "right" });
  doc.setFontSize(8.2);
  doc.text(summaryRange(messages), rightX, 50, { align: "right" });
}

function drawFooters(doc: jsPDF, channelTitle: string, generatedAt: Date) {
  const total = doc.getNumberOfPages();
  const gen = generatedAt.toLocaleString("pt-BR");
  const left = `HydraCode · ${channelTitle}`;
  const mid = `Gerado em ${gen}`;

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);

    doc.text(left, MARGIN, FOOTER_Y);

    const midW = doc.getTextWidth(mid);
    doc.text(mid, (PAGE_W - midW) / 2, FOOTER_Y);

    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, FOOTER_Y, {
      align: "right",
    });
  }
}

/**
 * Gera um PDF legível do histórico do chat (A4, tabela com quebra de página automática).
 */
export function downloadChatTranscriptPdf(opts: {
  channelTitle: string;
  groupTypeLabel: string;
  messages: ChatPdfMessage[];
  exportedBy?: string | null;
  generatedAt?: Date;
}): void {
  const {
    channelTitle,
    groupTypeLabel,
    messages,
    exportedBy,
    generatedAt = new Date(),
  } = opts;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("Histórico do chat", MARGIN, 22);

  drawTopMetaCard(doc, { channelTitle, groupTypeLabel, messages, exportedBy });
  const tableStartY = 62;

  if (messages.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(MARGIN, tableStartY + 2, PAGE_W - MARGIN * 2, 18, 2, 2, "FD");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Não há mensagens neste canal para exportar.", MARGIN + 5, tableStartY + 13);
    drawFooters(doc, channelTitle, generatedAt);
    const slug = safeFileSlug(channelTitle);
    const d = generatedAt.toISOString().slice(0, 10);
    doc.save(`chat-${slug}-${d}.pdf`);
    return;
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [["Data/Hora", "Autor", "Mensagem"]],
    body: buildTableBody(messages),
    margin: { left: MARGIN, right: MARGIN, bottom: 16 },
    showHead: "everyPage",
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
      halign: "left",
      valign: "middle",
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
    },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      textColor: [30, 41, 59],
      valign: "top",
      overflow: "linebreak",
      lineWidth: 0.1,
      lineColor: [226, 232, 240],
    },
    columnStyles: {
      0: { cellWidth: 34, halign: "left", fontSize: 8 },
      1: { cellWidth: 38, fontStyle: "bold" },
      2: { cellWidth: "auto", minCellWidth: 88 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    tableLineColor: [203, 213, 225],
    tableLineWidth: 0.15,
    didParseCell: (hookData) => {
      const raw = hookData.row.raw as unknown[];
      const isDateHeading = Array.isArray(raw) && raw.length === 1;
      if (isDateHeading) {
        hookData.cell.styles.lineWidth = 0;
        return;
      }
      if (hookData.section === "body" && hookData.column.index === 2) {
        hookData.cell.styles.cellPadding = { top: 3, bottom: 3, left: 2.5, right: 2.5 };
      }
    },
  });

  drawFooters(doc, channelTitle, generatedAt);

  const slug = safeFileSlug(channelTitle);
  const d = generatedAt.toISOString().slice(0, 10);
  doc.save(`chat-${slug}-${d}.pdf`);
}
