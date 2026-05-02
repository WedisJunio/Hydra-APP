import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina class names com merge inteligente (compatível com Tailwind). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Retorna iniciais para uso em avatar (no máx. 2 letras). */
export function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

/** Formata segundos como "Xh Ymin" ou "Ymin". */
export function formatSeconds(seconds: number) {
  const safe = Math.max(seconds || 0, 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

/** Formata segundos com precisão (Xh YYmin / Ymin ZZs / Zs) — para timer. */
export function formatDuration(seconds: number) {
  const s = Math.max(seconds || 0, 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

/** Formata YYYY-MM-DD para pt-BR ou retorna placeholder. */
export function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString("pt-BR");
}

/** Retorna data local no formato YYYY-MM-DD (sem efeito de UTC). */
export function getTodayLocalISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type DelayCheckTask = {
  status: string;
  planned_due_date: string | null;
  actual_completed_date?: string | null;
};

/** Compara duas datas YYYY-MM-DD ignorando horário. */
export function compareDateOnly(a: string, b: string) {
  return new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime();
}

/** Verdadeiro quando a tarefa foi concluída depois do prazo. */
export function isTaskCompletedLate(task: DelayCheckTask) {
  if (task.status !== "completed") return false;
  if (!task.planned_due_date || !task.actual_completed_date) return false;
  return compareDateOnly(task.actual_completed_date, task.planned_due_date) > 0;
}

/**
 * Verdadeiro quando a tarefa está atrasada:
 * - aberta e passou do prazo; ou
 * - concluída com atraso.
 */
export function isTaskDelayed(task: DelayCheckTask) {
  if (!task.planned_due_date) return false;
  if (isTaskCompletedLate(task)) return true;
  if (task.status !== "completed") {
    return compareDateOnly(getTodayLocalISO(), task.planned_due_date) > 0;
  }
  return false;
}

function toLocalISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODateAtLocalNoon(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`);
}

function easterSunday(year: number) {
  // Algoritmo de Meeus/Jones/Butcher para calendário gregoriano.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function brazilNationalHolidays(year: number) {
  const easter = easterSunday(year);
  const offsets = [0, -48, -47, -2, 60]; // páscoa, carnaval (seg/ter), sexta santa, corpus christi
  const mobile = offsets.map((offset) => {
    const holiday = new Date(easter);
    holiday.setDate(holiday.getDate() + offset);
    return toLocalISODate(holiday);
  });

  const fixed = [
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-09-07`, // Independência
    `${year}-10-12`, // Nossa Senhora Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra (nacional)
    `${year}-12-25`, // Natal
  ];

  return new Set([...fixed, ...mobile]);
}

export function isBusinessDay(isoDate: string) {
  const date = parseISODateAtLocalNoon(isoDate);
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return !brazilNationalHolidays(date.getFullYear()).has(isoDate);
}

/** Conta dias úteis no intervalo inclusivo [startDate, endDate]. */
export function countBusinessDaysInclusive(startDate: string, endDate: string) {
  if (compareDateOnly(endDate, startDate) < 0) return 0;
  let count = 0;
  const cursor = parseISODateAtLocalNoon(startDate);
  const end = parseISODateAtLocalNoon(endDate);
  while (cursor.getTime() <= end.getTime()) {
    const iso = toLocalISODate(cursor);
    if (isBusinessDay(iso)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Soma N dias úteis ao início (1 = mesmo dia útil). */
export function dueDateFromBusinessDays(startDate: string, days: number) {
  const totalDays = Math.max(0, Math.floor(days || 0));
  if (totalDays <= 0) return null;

  const cursor = parseISODateAtLocalNoon(startDate);
  while (!isBusinessDay(toLocalISODate(cursor))) {
    cursor.setDate(cursor.getDate() + 1);
  }

  let remaining = totalDays - 1;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(toLocalISODate(cursor))) {
      remaining -= 1;
    }
  }
  return toLocalISODate(cursor);
}
