"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MonthDayMeeting = {
  id: string;
  title: string;
  start_time: string;
  event_color: string | null;
};

export type MonthDayTask = {
  id: string;
  title: string;
  planned_due_date: string;
  status: string;
};

export type MonthDayProject = {
  id: string;
  name: string;
  municipality?: string | null;
  state?: string | null;
  planned_end_date: string;
};

export type DayBucket = {
  meetings: MonthDayMeeting[];
  tasks: MonthDayTask[];
  projects: MonthDayProject[];
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthTitlePt(y: number, m0: number) {
  return new Date(y, m0, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

type MonthCalendarGridProps = {
  year: number;
  monthIndex: number;
  itemsByDay: Map<string, DayBucket>;
  selectedDate: string;
  todayISO: string;
  loading?: boolean;
  onSelectDay: (iso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

export function MonthCalendarGrid({
  year,
  monthIndex,
  itemsByDay,
  selectedDate,
  todayISO,
  loading,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: MonthCalendarGridProps) {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  type Cell =
    | { kind: "pad" }
    | { kind: "day"; day: number; key: string };

  const cells: Cell[] = [];
  for (let i = 0; i < offset; i++) cells.push({ kind: "pad" });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad2(monthIndex + 1)}-${pad2(d)}`;
    cells.push({ kind: "day", day: d, key });
  }
  while (cells.length % 7 !== 0) cells.push({ kind: "pad" });

  return (
    <div>
      <div
        className="flex items-center justify-between gap-3 mb-4 flex-wrap"
        style={{ alignItems: "center" }}
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={onPrevMonth}
            title="Mês anterior"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={onNextMonth}
            title="Próximo mês"
            aria-label="Próximo mês"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
        <h2
          className="text-lg font-semibold capitalize m-0 min-w-0 text-center flex-1"
          style={{ textTransform: "capitalize" }}
        >
          {monthTitlePt(year, monthIndex)}
        </h2>
        {loading ? (
          <span className="text-sm text-muted" style={{ width: 72, textAlign: "right" }}>
            Carregando…
          </span>
        ) : (
          <span className="text-sm text-muted" style={{ width: 72 }} />
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 6,
          marginBottom: 8,
        }}
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="text-xs text-muted font-medium text-center"
            style={{ padding: "4px 0" }}
          >
            {w}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 6,
        }}
      >
        {cells.map((cell, idx) => {
          if (cell.kind === "pad") {
            return (
              <div
                key={`pad-${idx}`}
                aria-hidden
                style={{ minHeight: 88, background: "transparent" }}
              />
            );
          }

          const { key, day } = cell;
          const bucket = itemsByDay.get(key) ?? {
            meetings: [],
            tasks: [],
            projects: [],
          };
          const nMeet = bucket.meetings.length;
          const nTask = bucket.tasks.length;
          const nProj = bucket.projects.length;
          const total = nMeet + nTask + nProj;
          const isToday = key === todayISO;
          const isSelected = key === selectedDate;

          const dots: { color: string; title: string }[] = [];
          if (nTask > 0) {
            dots.push({ color: "#3b82f6", title: `${nTask} tarefa(s) com prazo` });
          }
          if (nProj > 0) {
            dots.push({ color: "#a855f7", title: `${nProj} projeto(s) — entrega` });
          }
          if (nMeet > 0) {
            dots.push({ color: "#22c55e", title: `${nMeet} reunião(ões)` });
          }

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key)}
              className={cn("text-left")}
              style={{
                minHeight: 88,
                padding: "6px 8px",
                borderRadius: "var(--radius-md)",
                border: isSelected
                  ? "2px solid var(--primary)"
                  : "1px solid var(--border)",
                background: isSelected ? "var(--surface-2)" : "var(--surface-1)",
                boxShadow: isToday ? "inset 0 0 0 1px var(--primary)" : undefined,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                overflow: "hidden",
              }}
            >
              <div className="flex items-start justify-between gap-1">
                <span
                  className="text-sm font-semibold"
                  style={{
                    color: isToday ? "var(--primary)" : "var(--foreground)",
                  }}
                >
                  {day}
                </span>
                {total > 0 && (
                  <span className="text-xs text-muted" title={`${total} itens`}>
                    {total}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap" style={{ minHeight: 14 }}>
                {dots.slice(0, 3).map((d, i) => (
                  <span
                    key={i}
                    title={d.title}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: d.color,
                      flexShrink: 0,
                    }}
                  />
                ))}
                {dots.length > 3 && (
                  <span className="text-xs text-muted" style={{ lineHeight: 1 }}>
                    +
                  </span>
                )}
              </div>
              {total > 0 && (
                <div
                  className="text-xs text-muted"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    lineHeight: 1.25,
                    fontSize: 10,
                  }}
                >
                  {[
                    nTask ? `${nTask} tarefa` : null,
                    nProj ? `${nProj} projeto` : null,
                    nMeet ? `${nMeet} reunião` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-wrap gap-4 mt-4 text-xs text-muted"
        style={{ alignItems: "center" }}
      >
        <span className="flex items-center gap-2">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#3b82f6",
              display: "inline-block",
            }}
          />
          Prazo de tarefa
        </span>
        <span className="flex items-center gap-2">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#a855f7",
              display: "inline-block",
            }}
          />
          Entrega de projeto
        </span>
        <span className="flex items-center gap-2">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
            }}
          />
          Reunião
        </span>
        <span className="text-muted" style={{ marginLeft: "auto" }}>
          Semana começa na segunda-feira
        </span>
      </div>
    </div>
  );
}
