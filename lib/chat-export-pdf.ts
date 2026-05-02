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
          colSpan: 4,
          styles: {
            fillColor: [226, 232, 240],
            textColor: [51, 65, 85],
            fontStyle: "bold",
            halign: "center",
            valign: "middle",
            fontSize: 9,
            cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
          },
        },
      ]);
    }

    const author = m.users?.name?.trim() || "—";
    const content = sanitizeCell(m.content || "");
    const displayContent = content.length > 0 ? content : "(sem texto)";

    rows.push([
      formatDateCell(m.created_at),
      formatTimeCell(m.created_at),
      author,
      displayContent,
    ]);
  }

  return rows;
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
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text("Histórico do chat", MARGIN, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(51, 65, 85);
  const titleLine = `Canal: ${channelTitle}`;
  const splitTitle = doc.splitTextToSize(titleLine, PAGE_W - MARGIN * 2);
  doc.text(splitTitle, MARGIN, 31);

  let y = 31 + splitTitle.length * 5.5;
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Tipo: ${groupTypeLabel}`, MARGIN, y);
  y += 5;
  doc.text(`Total de mensagens: ${messages.length}`, MARGIN, y);
  y += 5;
  if (exportedBy) {
    doc.text(`Exportado por: ${exportedBy}`, MARGIN, y);
    y += 5;
  }

  const tableStartY = y + 4;

  if (messages.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text("Não há mensagens neste canal para exportar.", MARGIN, tableStartY);
    drawFooters(doc, channelTitle, generatedAt);
    const slug = safeFileSlug(channelTitle);
    const d = generatedAt.toISOString().slice(0, 10);
    doc.save(`chat-${slug}-${d}.pdf`);
    return;
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [["Data", "Hora", "Autor", "Mensagem"]],
    body: buildTableBody(messages),
    margin: { left: MARGIN, right: MARGIN, bottom: 16 },
    showHead: "everyPage",
    headStyles: {
      fillColor: [37, 99, 235],
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
      0: { cellWidth: 22, halign: "left" },
      1: { cellWidth: 14, halign: "center", fontSize: 8 },
      2: { cellWidth: 32, fontStyle: "bold" },
      3: { cellWidth: "auto", minCellWidth: 70 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    tableLineColor: [203, 213, 225],
    tableLineWidth: 0.15,
  });

  drawFooters(doc, channelTitle, generatedAt);

  const slug = safeFileSlug(channelTitle);
  const d = generatedAt.toISOString().slice(0, 10);
  doc.save(`chat-${slug}-${d}.pdf`);
}
