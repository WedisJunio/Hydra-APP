"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Folder,
} from "lucide-react";
import { formatProjectDisplayName } from "@/lib/project-display";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GanttProject = {
  id: string;
  name: string;
  municipality?: string | null;
  state?: string | null;
  planned_end_date: string | null;
  actual_end_date?: string | null;
  created_at?: string | null;
};

export type GanttTask = {
  id: string;
  title: string;
  status: string;
  project_id: string;
  assigned_to: string | null;
  planned_due_date: string | null;
  actual_completed_date: string | null;
  completed_at: string | null;
  created_at: string | null;
  start_date?: string | null;
  is_timer_running?: boolean;
};

export type GanttUser = { id: string; name: string };

export type GanttScale = "day" | "week" | "month";

// ─── Helpers ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseISO(date?: string | null): Date | null {
  if (!date) return null;
  const d = new Date(date.length <= 10 ? date + "T12:00:00" : date);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function fmtBR(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtMonth(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function fmtWeek(d: Date) {
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function getTaskRange(task: GanttTask): { start: Date; end: Date } | null {
  const start =
    parseISO(task.start_date) ||
    parseISO(task.created_at) ||
    parseISO(task.planned_due_date);
  const end =
    parseISO(task.actual_completed_date) ||
    parseISO(task.completed_at) ||
    parseISO(task.planned_due_date) ||
    parseISO(task.start_date) ||
    parseISO(task.created_at);
  if (!start || !end) return null;
  // garante que end >= start
  if (end.getTime() < start.getTime()) return { start, end: start };
  return { start, end };
}

function getStatusVisual(task: GanttTask, today: Date) {
  if (task.status === "completed") {
    return {
      label: "Concluída",
      bg: "var(--success-soft)",
      bar: "var(--success)",
      icon: <CheckCircle2 size={11} />,
    };
  }
  const due = parseISO(task.planned_due_date);
  if (due && startOfDay(today) > startOfDay(due) && task.status !== "completed") {
    return {
      label: "Atrasada",
      bg: "var(--danger-soft)",
      bar: "var(--danger)",
      icon: <AlertTriangle size={11} />,
    };
  }
  if (task.status === "in_progress" || task.is_timer_running) {
    return {
      label: "Em andamento",
      bg: "var(--primary-soft)",
      bar: "var(--primary)",
      icon: <Clock size={11} />,
    };
  }
  return {
    label: "Pendente",
    bg: "var(--surface-3)",
    bar: "var(--subtle-fg)",
    icon: <Clock size={11} />,
  };
}

// ─── Main component ──────────────────────────────────────────────────────────

export function GanttChart({
  projects,
  tasks,
  users,
}: {
  projects: GanttProject[];
  tasks: GanttTask[];
  users: GanttUser[];
}) {
  const [scale, setScale] = useState<GanttScale>("week");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const today = startOfDay(new Date());

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [users]);

  const projectGroups = useMemo(() => {
    return projects
      .map((project) => {
        const projectTasks = tasks
          .filter((t) => t.project_id === project.id)
          .map((t) => ({ task: t, range: getTaskRange(t) }))
          .filter(
            (x): x is { task: GanttTask; range: { start: Date; end: Date } } =>
              !!x.range
          )
          .sort((a, b) => a.range.start.getTime() - b.range.start.getTime());
        return { project, projectTasks };
      })
      .filter((g) => g.projectTasks.length > 0);
  }, [projects, tasks]);

  const { rangeStart, rangeEnd, totalDays, dayPx } = useMemo(() => {
    if (projectGroups.length === 0) {
      const fallbackStart = addDays(today, -14);
      const fallbackEnd = addDays(today, 30);
      return {
        rangeStart: fallbackStart,
        rangeEnd: fallbackEnd,
        totalDays: diffDays(fallbackStart, fallbackEnd) || 1,
        dayPx: 24,
      };
    }
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;
    projectGroups.forEach((g) =>
      g.projectTasks.forEach(({ range }) => {
        if (!minStart || range.start < minStart) minStart = range.start;
        if (!maxEnd || range.end > maxEnd) maxEnd = range.end;
      })
    );
    if (!minStart) minStart = addDays(today, -14);
    if (!maxEnd) maxEnd = addDays(today, 30);
    const start = addDays(minStart, -3);
    const end = addDays(maxEnd, 3);
    const total = Math.max(diffDays(start, end), 1);
    const px = scale === "day" ? 32 : scale === "week" ? 14 : 4;
    return {
      rangeStart: start,
      rangeEnd: end,
      totalDays: total,
      dayPx: px,
    };
  }, [projectGroups, scale, today]);

  const timelineWidth = totalDays * dayPx;

  // ─── Header ticks ──────────────────────────────────────────────────────────
  const headerTicks = useMemo(() => {
    const ticks: { left: number; label: string; major: boolean }[] = [];
    if (scale === "day") {
      for (let i = 0; i <= totalDays; i++) {
        const date = addDays(rangeStart, i);
        ticks.push({
          left: i * dayPx,
          label: fmtWeek(date),
          major: date.getDay() === 1,
        });
      }
    } else if (scale === "week") {
      for (let i = 0; i <= totalDays; i++) {
        const date = addDays(rangeStart, i);
        if (date.getDay() === 1) {
          ticks.push({ left: i * dayPx, label: fmtWeek(date), major: true });
        }
      }
    } else {
      // month
      let cursor = new Date(rangeStart);
      cursor.setDate(1);
      while (cursor <= rangeEnd) {
        const left = diffDays(rangeStart, cursor) * dayPx;
        ticks.push({ left, label: fmtMonth(cursor), major: true });
        cursor = new Date(cursor);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    return ticks;
  }, [scale, totalDays, rangeStart, rangeEnd, dayPx]);

  const todayLeft = diffDays(rangeStart, today) * dayPx;
  const todayInRange = today >= rangeStart && today <= rangeEnd;

  if (projectGroups.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "var(--muted-fg)",
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--surface)",
        }}
      >
        <CalendarDays size={28} style={{ opacity: 0.5, marginBottom: 8 }} />
        <p style={{ margin: 0, fontSize: 14 }}>
          Nenhuma tarefa com data para montar o cronograma.
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 12 }}>
          Adicione tarefas com datas previstas e elas aparecerão no Gantt.
        </p>
      </div>
    );
  }

  const labelColWidth = 280;
  const rowHeight = 36;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarDays size={14} style={{ color: "var(--primary)" }} />
          <strong style={{ fontSize: 13 }}>Cronograma (Gantt)</strong>
          <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            {fmtBR(rangeStart)} — {fmtBR(rangeEnd)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["day", "week", "month"] as GanttScale[]).map((s) => {
            const active = scale === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setScale(s)}
                style={{
                  border: "1px solid var(--border)",
                  background: active ? "var(--primary)" : "var(--surface)",
                  color: active ? "var(--primary-fg)" : "var(--foreground)",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "all 120ms ease",
                }}
              >
                {s === "day" ? "Dia" : s === "week" ? "Semana" : "Mês"}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: labelColWidth + timelineWidth, position: "relative" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
              position: "sticky",
              top: 0,
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: labelColWidth,
                flexShrink: 0,
                padding: "8px 12px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--muted-fg)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                borderRight: "1px solid var(--border)",
              }}
            >
              Projeto / Tarefa
            </div>
            <div style={{ position: "relative", flex: 1, height: 32 }}>
              {headerTicks.map((tick, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: tick.left,
                    top: 0,
                    height: "100%",
                    borderLeft: tick.major
                      ? "1px solid var(--border)"
                      : "1px dashed var(--border)",
                    fontSize: 10,
                    color: tick.major
                      ? "var(--foreground)"
                      : "var(--muted-fg)",
                    paddingLeft: 4,
                    fontWeight: tick.major ? 600 : 400,
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {tick.label}
                </div>
              ))}
            </div>
          </div>

          {/* Today marker */}
          {todayInRange && (
            <div
              style={{
                position: "absolute",
                left: labelColWidth + todayLeft,
                top: 32,
                bottom: 0,
                width: 2,
                background: "var(--danger)",
                opacity: 0.6,
                pointerEvents: "none",
                zIndex: 1,
              }}
              aria-hidden
            >
              <div
                style={{
                  position: "absolute",
                  top: -4,
                  left: -10,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  background: "var(--danger)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                }}
              >
                Hoje
              </div>
            </div>
          )}

          {/* Rows */}
          {projectGroups.map(({ project, projectTasks }) => {
            const isCollapsed = collapsed[project.id] === true;
            const projectStart = projectTasks.reduce<Date | null>(
              (acc, x) => (!acc || x.range.start < acc ? x.range.start : acc),
              null
            );
            const projectEnd = projectTasks.reduce<Date | null>(
              (acc, x) => (!acc || x.range.end > acc ? x.range.end : acc),
              null
            );
            const completed = projectTasks.filter(
              (x) => x.task.status === "completed"
            ).length;
            const total = projectTasks.length;
            const progress =
              total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <div key={project.id}>
                {/* Project row */}
                <div
                  style={{
                    display: "flex",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    height: rowHeight,
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [project.id]: !prev[project.id],
                    }))
                  }
                >
                  <div
                    style={{
                      width: labelColWidth,
                      flexShrink: 0,
                      padding: "0 12px",
                      borderRight: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    <Folder size={13} style={{ color: "var(--primary)" }} />
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                      }}
                    >
                      {formatProjectDisplayName(project)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--muted-fg)",
                        fontWeight: 500,
                      }}
                    >
                      {progress}%
                    </span>
                  </div>
                  <div style={{ position: "relative", flex: 1, height: "100%" }}>
                    {projectStart && projectEnd && (
                      <div
                        style={{
                          position: "absolute",
                          left: diffDays(rangeStart, projectStart) * dayPx,
                          width: Math.max(
                            (diffDays(projectStart, projectEnd) + 1) * dayPx,
                            6
                          ),
                          top: 12,
                          bottom: 12,
                          background:
                            "linear-gradient(90deg, var(--primary-soft), color-mix(in srgb, var(--primary) 25%, transparent))",
                          borderRadius: 4,
                          border:
                            "1px solid color-mix(in srgb, var(--primary) 40%, transparent)",
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Task rows */}
                {!isCollapsed &&
                  projectTasks.map(({ task, range }) => {
                    const visual = getStatusVisual(task, today);
                    const left = diffDays(rangeStart, range.start) * dayPx;
                    const width = Math.max(
                      (diffDays(range.start, range.end) + 1) * dayPx,
                      8
                    );
                    const assignee = task.assigned_to
                      ? userMap.get(task.assigned_to) ?? "—"
                      : "Sem responsável";
                    return (
                      <div
                        key={task.id}
                        style={{
                          display: "flex",
                          borderBottom: "1px solid var(--border)",
                          height: rowHeight,
                          alignItems: "center",
                          background: "var(--surface)",
                        }}
                      >
                        <div
                          style={{
                            width: labelColWidth,
                            flexShrink: 0,
                            padding: "0 12px 0 30px",
                            borderRight: "1px solid var(--border)",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={task.title}
                          >
                            {task.title}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--muted-fg)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {assignee}
                          </span>
                        </div>
                        <div
                          style={{ position: "relative", flex: 1, height: "100%" }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left,
                              width,
                              top: 8,
                              bottom: 8,
                              background: visual.bg,
                              border: `1px solid ${visual.bar}`,
                              borderRadius: 4,
                              display: "flex",
                              alignItems: "center",
                              padding: "0 6px",
                              gap: 4,
                              overflow: "hidden",
                              cursor: "default",
                            }}
                            title={`${task.title}\n${visual.label}\nInício: ${fmtBR(
                              range.start
                            )}\nFim: ${fmtBR(range.end)}\nResponsável: ${assignee}`}
                          >
                            <span style={{ color: visual.bar, flexShrink: 0 }}>
                              {visual.icon}
                            </span>
                            {width > 60 && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: visual.bar,
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {visual.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 11,
          color: "var(--muted-fg)",
          background: "var(--surface-2)",
        }}
      >
        <LegendDot color="var(--success)" label="Concluída" />
        <LegendDot color="var(--primary)" label="Em andamento" />
        <LegendDot color="var(--subtle-fg)" label="Pendente" />
        <LegendDot color="var(--danger)" label="Atrasada" />
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: 12,
              background: "var(--danger)",
              opacity: 0.6,
            }}
          />
          Hoje
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: 3,
          background: color,
        }}
      />
      {label}
    </span>
  );
}
