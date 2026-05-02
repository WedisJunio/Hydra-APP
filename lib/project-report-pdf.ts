import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatSeconds } from "@/lib/utils";

type StatusBreakdown = {
  pending: number;
  inProgress: number;
  completed: number;
  delayed: number;
};

type ContributorRow = {
  name: string;
  role: string;
  tasks: number;
  completed: number;
  delayed: number;
  seconds: number;
};

export type ProjectPdfInput = {
  projectName: string;
  leaderName: string;
  managerName: string;
  coordinatorName: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  delayedTasks: number;
  totalSeconds: number;
  averageSeconds: number;
  contributors: ContributorRow[];
  generatedAt: Date;
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const RIGHT_EDGE = PAGE_W - MARGIN; // 196mm
const CONTENT_W = RIGHT_EDGE - MARGIN; // 182mm
const COL_MID = 108; // start of right analytics column

function drawFooter(doc: jsPDF) {
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, PAGE_H - 12, RIGHT_EDGE, PAGE_H - 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("HydraCode - Relatorio Confidencial", MARGIN, PAGE_H - 7);
  doc.text("Pagina 1 de 1", RIGHT_EDGE, PAGE_H - 7, { align: "right" });
}

function drawDivider(doc: jsPDF, y: number) {
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y, RIGHT_EDGE, y);
}

function drawSectionTitle(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(text, x, y);
}

function drawKpiCard(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  accentColor: [number, number, number]
) {
  const W = 42;
  const H = 22;

  // Card background
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, W, H, 2, 2, "FD");

  // Left accent border
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(2.5);
  doc.line(x + 1.25, y + 2.5, x + 1.25, y + H - 2.5);

  // Label
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(label, x + 5, y + 9);

  // Value
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(value, x + 5, y + 17);
}

function drawStatusBars(doc: jsPDF, y: number, breakdown: StatusBreakdown, totalTasks: number) {
  // Left column: x=14 to x=104mm
  const labelX = MARGIN;
  const countX = 54; // right-aligned count before bar
  const barX = 56;
  const barW = 42; // bar ends at 98mm
  const pctX = 102; // percentage right-aligned

  const bars = [
    { label: "Pendentes", value: breakdown.pending, color: [217, 119, 6] as [number, number, number] },
    { label: "Em andamento", value: breakdown.inProgress, color: [37, 99, 235] as [number, number, number] },
    { label: "Concluidas", value: breakdown.completed, color: [22, 163, 74] as [number, number, number] },
    { label: "Atrasadas", value: breakdown.delayed, color: [220, 38, 38] as [number, number, number] },
  ];

  drawSectionTitle(doc, "DISTRIBUICAO DE STATUS", labelX, y);
  let cursorY = y + 8;

  bars.forEach((bar) => {
    const ratio = totalTasks > 0 ? bar.value / totalTasks : 0;
    const fillWidth = bar.value > 0 ? Math.max(Math.round(ratio * barW), 2) : 0;
    const pct = Math.round(ratio * 100);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(bar.label, labelX, cursorY + 4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...bar.color);
    doc.text(String(bar.value), countX, cursorY + 4, { align: "right" });

    // Track
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barX, cursorY, barW, 5, 2, 2, "F");

    // Fill
    if (fillWidth > 0) {
      doc.setFillColor(...bar.color);
      doc.roundedRect(barX, cursorY, fillWidth, 5, 2, 2, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`${pct}%`, pctX, cursorY + 4, { align: "right" });

    cursorY += 11;
  });
}

function drawTopContributors(doc: jsPDF, y: number, contributors: ContributorRow[]) {
  // Right column: x=108 to x=196mm (88mm wide)
  const colX = COL_MID;
  const nameEndX = colX + 36; // 36mm for rank + name
  const barX = nameEndX + 2; // bar starts at 146mm
  const barW = 38; // bar ends at 184mm
  const hoursX = RIGHT_EDGE; // 196mm right-aligned

  const top = [...contributors].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
  const maxSeconds = top[0]?.seconds || 1;

  const colors: [number, number, number][] = [
    [59, 130, 246],
    [14, 165, 233],
    [124, 58, 237],
    [16, 185, 129],
    [245, 158, 11],
  ];

  drawSectionTitle(doc, "TOP COLABORADORES POR HORAS", colX, y);

  // Vertical divider between columns
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(COL_MID - 4, y - 2, COL_MID - 4, y + 8 + top.length * 12 + 4);

  let cursorY = y + 8;
  top.forEach((person, idx) => {
    const ratio = person.seconds / maxSeconds;
    const fillW = person.seconds > 0 ? Math.max(Math.round(ratio * barW), 2) : 0;
    const color = colors[idx] || ([99, 102, 241] as [number, number, number]);

    // Rank
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...color);
    doc.text(`${idx + 1}.`, colX, cursorY + 4);

    // Name (truncated to fit)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const nameText = doc.splitTextToSize(person.name, nameEndX - colX - 6)[0] as string;
    doc.text(nameText, colX + 6, cursorY + 4);

    // Bar track
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barX, cursorY, barW, 4.5, 2, 2, "F");

    // Bar fill
    if (fillW > 0) {
      doc.setFillColor(...color);
      doc.roundedRect(barX, cursorY, fillW, 4.5, 2, 2, "F");
    }

    // Hours
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(formatSeconds(person.seconds), hoursX, cursorY + 4, { align: "right" });

    cursorY += 12;
  });
}

export function generateProjectDashboardPdf(input: ProjectPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ── HEADER ─────────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE_W, 38, "F");

  // Blue accent stripe at bottom of header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 38, PAGE_W, 2, "F");

  // Company name + report type
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("HYDRACODE  /  RELATORIO DE PROJETO", MARGIN, 10);

  // Project name
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(input.projectName, MARGIN, 24);

  // Generated date (top-right)
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(
    `Gerado em ${input.generatedAt.toLocaleDateString("pt-BR")} as ${input.generatedAt.toLocaleTimeString("pt-BR")}`,
    RIGHT_EDGE,
    34,
    { align: "right" }
  );

  // ── RESPONSÁVEIS ───────────────────────────────────────────────────────────
  let y = 48;
  drawSectionTitle(doc, "RESPONSAVEIS", MARGIN, y);
  drawDivider(doc, y + 2);

  y += 9;
  const personColW = CONTENT_W / 3;
  const persons = [
    { label: "Lider", name: input.leaderName },
    { label: "Gerente", name: input.managerName },
    { label: "Coordenador", name: input.coordinatorName },
  ];

  persons.forEach((p, i) => {
    const px = MARGIN + i * personColW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(p.label, px, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(p.name || "—", px, y + 6);
  });

  // ── KPI CARDS ROW 1 ────────────────────────────────────────────────────────
  y += 16;
  drawKpiCard(doc, MARGIN, y, "Total de Tarefas", String(input.totalTasks), [37, 99, 235]);
  drawKpiCard(doc, 58, y, "Concluidas", String(input.completedTasks), [22, 163, 74]);
  drawKpiCard(doc, 102, y, "Atrasadas", String(input.delayedTasks), [220, 38, 38]);
  drawKpiCard(doc, 146, y, "Tempo Total", formatSeconds(input.totalSeconds), [124, 58, 237]);

  // ── KPI CARDS ROW 2 ────────────────────────────────────────────────────────
  y += 26;

  const completionRate = input.totalTasks > 0 ? input.completedTasks / input.totalTasks : 0;
  const completionColor: [number, number, number] =
    completionRate >= 0.8 ? [22, 163, 74] : completionRate >= 0.5 ? [217, 119, 6] : [220, 38, 38];

  drawKpiCard(doc, MARGIN, y, "Em Andamento", String(input.inProgressTasks), [14, 165, 233]);
  drawKpiCard(doc, 58, y, "Pendentes", String(input.pendingTasks), [217, 119, 6]);
  drawKpiCard(doc, 102, y, "Media por Tarefa", formatSeconds(input.averageSeconds), [71, 85, 105]);
  drawKpiCard(
    doc,
    146,
    y,
    "Taxa de Conclusao",
    `${Math.round(completionRate * 100)}%`,
    completionColor
  );

  // ── ANALYTICS SECTION ──────────────────────────────────────────────────────
  y += 30;
  drawDivider(doc, y);
  y += 7;

  drawStatusBars(
    doc,
    y,
    {
      pending: input.pendingTasks,
      inProgress: input.inProgressTasks,
      completed: input.completedTasks,
      delayed: input.delayedTasks,
    },
    input.totalTasks
  );

  if (input.contributors.length > 0) {
    drawTopContributors(doc, y, input.contributors);
  }

  // Analytics section height: title(8) + 4 bars * 11 = 52mm (status)
  // Contributors: title(8) + 5 entries * 12 = 68mm
  const analyticsHeight = input.contributors.length > 0 ? 72 : 54;

  // ── COLLABORATORS TABLE ────────────────────────────────────────────────────
  const tableY = y + analyticsHeight;
  drawDivider(doc, tableY - 3);

  autoTable(doc, {
    startY: tableY,
    head: [["Colaborador", "Papel", "Tarefas", "Concluidas", "Atrasadas", "Horas"]],
    body: [...input.contributors]
      .sort((a, b) => b.seconds - a.seconds)
      .map((p) => [
        p.name,
        p.role,
        p.tasks.toString(),
        p.completed.toString(),
        p.delayed.toString(),
        formatSeconds(p.seconds),
      ]),
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 36 },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 22, halign: "center" },
      5: { cellWidth: 30, halign: "right" },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  drawFooter(doc);

  const fileNameSafe = input.projectName
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  doc.save(`relatorio-${fileNameSafe || "projeto"}.pdf`);
}
