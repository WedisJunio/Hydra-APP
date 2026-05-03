"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  FolderKanban,
  Timer,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Activity,
  Zap,
  Droplets,
  Building2,
  ClipboardCheck,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  filterTasksForDashboard,
  filterUsersForDashboard,
  hasFullPortfolioAccess,
  isNarrowProjetista,
} from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { Stat, StatsGrid } from "@/components/ui/stat";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  formatSeconds,
  getTodayLocalISO,
  isTaskDelayed,
} from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  name: string;
  discipline?: string | null;
};

type User = {
  id: string;
  name: string;
  role?: string | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  project_id: string;
  assigned_to: string | null;
  created_by?: string | null;
  planned_due_date: string | null;
  actual_completed_date: string | null;
  completed_at: string | null;
  created_at: string | null;
  time_spent_seconds: number;
  is_timer_running: boolean;
  started_at: string | null;
};

type Approval = {
  id: string;
  project_id: string;
  status: string;
  expected_response_date: string | null;
};

type Phase = {
  id: string;
  project_id: string;
  status: string;
};

type ActiveTab = "geral" | string;
type PeriodKey = "7d" | "30d" | "90d" | "all";

// ─── Constants ───────────────────────────────────────────────────────────────

const CHART_COLORS = {
  primary: "#2563EB",
  primaryLight: "#3B82F6",
  success: "#16A34A",
  successLight: "#22C55E",
  warning: "#D97706",
  warningLight: "#F59E0B",
  danger: "#DC2626",
  dangerLight: "#EF4444",
  info: "#0EA5E9",
  infoLight: "#38BDF8",
  purple: "#7C3AED",
  purpleLight: "#8B5CF6",
};

const PERIOD_OPTIONS: { value: PeriodKey; label: string; days: number | null }[] = [
  { value: "7d", label: "7 dias", days: 7 },
  { value: "30d", label: "30 dias", days: 30 },
  { value: "90d", label: "90 dias", days: 90 },
  { value: "all", label: "Tudo", days: null },
];

// ─── Discipline helpers ───────────────────────────────────────────────────────

function getDisciplineIcon(discipline: string) {
  const d = discipline.toLowerCase();
  if (d.includes("saneamento")) return <Droplets size={14} />;
  if (d.includes("amplia")) return <Building2 size={14} />;
  return <Layers size={14} />;
}

function getDisciplineLabel(discipline: string) {
  return discipline.charAt(0).toUpperCase() + discipline.slice(1).toLowerCase();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLiveSeconds(task: Task) {
  if (!task.is_timer_running || !task.started_at) {
    return task.time_spent_seconds || 0;
  }
  const started = new Date(task.started_at).getTime();
  const diff = Math.max(Math.floor((Date.now() - started) / 1000), 0);
  return (task.time_spent_seconds || 0) + diff;
}

function shiftDate(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toLocalISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function filterTasksByPeriod(tasks: Task[], period: PeriodKey): Task[] {
  const opt = PERIOD_OPTIONS.find((o) => o.value === period);
  if (!opt || opt.days === null) return tasks;

  const start = shiftDate(new Date(), -opt.days + 1);
  start.setHours(0, 0, 0, 0);

  return tasks.filter((task) => {
    if (task.status !== "completed") return true;
    const ref = task.completed_at || task.actual_completed_date || task.created_at;
    if (!ref) return true;
    return new Date(ref).getTime() >= start.getTime();
  });
}

function buildDailySeries(tasks: Task[], days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets: { date: string; horas: number; concluidas: number; label: string }[] = [];
  const map = new Map<string, { date: string; horas: number; concluidas: number; label: string }>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = shiftDate(today, -i);
    const iso = toLocalISODate(d);
    const bucket = { date: iso, horas: 0, concluidas: 0, label: formatShortDate(iso) };
    buckets.push(bucket);
    map.set(iso, bucket);
  }

  for (const task of tasks) {
    const ref = task.actual_completed_date || (task.completed_at ? task.completed_at.slice(0, 10) : null);
    if (!ref || !map.has(ref)) continue;
    if (task.status === "completed") {
      map.get(ref)!.concluidas += 1;
    }
    map.get(ref)!.horas += (task.time_spent_seconds || 0) / 3600;
  }

  return buckets.map((b) => ({
    ...b,
    horas: Number(b.horas.toFixed(2)),
  }));
}

// ─── Custom Tooltip (rich, themed) ───────────────────────────────────────────

type TooltipPayload = {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
};

function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 12px 28px rgba(2, 6, 23, 0.35)",
        padding: "10px 14px",
        fontSize: 12,
        minWidth: 160,
      }}
    >
      {label && (
        <div
          style={{
            fontWeight: 600,
            marginBottom: 6,
            color: "var(--foreground)",
            fontSize: 12,
          }}
        >
          {label}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-3"
            style={{ color: "var(--muted-fg)" }}
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: entry.color,
                  display: "inline-block",
                }}
              />
              <span>{entry.name}</span>
            </div>
            <span
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            >
              {typeof entry.value === "number"
                ? entry.value.toLocaleString("pt-BR")
                : entry.value}
              {unit ? ` ${unit}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Donut with side legend ──────────────────────────────────────────────────

function DonutWithLegend({
  data,
  centerValue,
  centerLabel,
}: {
  data: { name: string; value: number; color: string }[];
  centerValue: React.ReactNode;
  centerLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const empty = total === 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 220px) 1fr",
        gap: 16,
        alignItems: "center",
      }}
    >
      <div style={{ position: "relative", width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={empty ? [{ name: "Vazio", value: 1, color: "var(--surface-3)" }] : data}
              dataKey="value"
              nameKey="name"
              outerRadius={95}
              innerRadius={66}
              paddingAngle={empty ? 0 : 3}
              stroke="var(--surface)"
              strokeWidth={3}
              startAngle={90}
              endAngle={-270}
            >
              {(empty ? [{ color: "var(--surface-3)" }] : data).map((e, i) => (
                <Cell key={i} fill={e.color} />
              ))}
            </Pie>
            {!empty && <Tooltip content={<CustomTooltip />} />}
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--foreground)",
              lineHeight: 1,
            }}
          >
            {centerValue}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted-fg)",
              marginTop: 4,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            {centerLabel}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {data.map((item) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div
              key={item.name}
              className="rounded-md p-3"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: item.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="text-sm truncate"
                    style={{ color: "var(--foreground)", fontWeight: 500 }}
                  >
                    {item.name}
                  </span>
                </div>
                <span className="text-sm font-bold">{item.value}</span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "var(--surface-3)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: item.color,
                    borderRadius: 3,
                    transition: "width 400ms ease",
                  }}
                />
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: "var(--muted-fg)", fontWeight: 500 }}
              >
                {pct}% do total
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Gauge semicircular ──────────────────────────────────────────────────────

function HealthGauge({
  percent,
  delayed,
  onTime,
}: {
  percent: number;
  delayed: number;
  onTime: number;
}) {
  const data = [{ name: "Saúde", value: percent, fill: "url(#gaugeGradient)" }];
  const color =
    percent >= 90
      ? CHART_COLORS.success
      : percent >= 70
      ? CHART_COLORS.warning
      : CHART_COLORS.danger;

  return (
    <div className="flex flex-col items-center">
      <div style={{ width: "100%", height: 220, position: "relative" }}>
        <ResponsiveContainer>
          <RadialBarChart
            innerRadius="74%"
            outerRadius="100%"
            data={data}
            startAngle={210}
            endAngle={-30}
            cx="50%"
            cy="60%"
          >
            <defs>
              <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                <stop offset="100%" stopColor={color} stopOpacity={1} />
              </linearGradient>
            </defs>
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <RadialBar
              background={{ fill: "var(--surface-3)" }}
              dataKey="value"
              cornerRadius={20}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            paddingTop: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color,
              lineHeight: 1,
            }}
          >
            {percent}%
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--muted-fg)",
              marginTop: 6,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            no prazo
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          width: "100%",
          marginTop: 4,
        }}
      >
        <div
          className="rounded-md p-3 text-center"
          style={{
            background: "var(--success-soft)",
            border: `1px solid ${CHART_COLORS.success}33`,
          }}
        >
          <div className="text-xs" style={{ color: "var(--success-fg)", fontWeight: 600 }}>
            No prazo
          </div>
          <div
            className="font-bold mt-1"
            style={{ fontSize: 22, color: "var(--success)" }}
          >
            {onTime}
          </div>
        </div>
        <div
          className="rounded-md p-3 text-center"
          style={{
            background: delayed > 0 ? "var(--danger-soft)" : "var(--surface-2)",
            border: `1px solid ${delayed > 0 ? CHART_COLORS.danger + "33" : "var(--border)"}`,
          }}
        >
          <div
            className="text-xs"
            style={{
              color: delayed > 0 ? "var(--danger-fg)" : "var(--muted-fg)",
              fontWeight: 600,
            }}
          >
            Em atraso
          </div>
          <div
            className="font-bold mt-1"
            style={{
              fontSize: 22,
              color: delayed > 0 ? "var(--danger)" : "var(--muted-fg)",
            }}
          >
            {delayed}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Heatmap de atividade (estilo GitHub) ────────────────────────────────────

function ActivityHeatmap({
  data,
}: {
  data: { date: string; horas: number; concluidas: number; label: string }[];
}) {
  if (data.length === 0) return null;

  const maxHoras = Math.max(...data.map((d) => d.horas), 0.01);

  // Build columns: 7 rows (weekday) × N cols (week)
  const firstDate = new Date(data[0].date + "T12:00:00");
  // Adjust to start from Sunday of first week
  const firstWeekday = firstDate.getDay();
  const offset = firstWeekday;

  const cells: ({ date: string; horas: number; concluidas: number; label: string } | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  cells.push(...data);

  // pad the end so we form complete weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const intensity = (horas: number) => {
    if (horas === 0) return 0;
    const ratio = horas / maxHoras;
    if (ratio < 0.25) return 1;
    if (ratio < 0.5) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  const colorByLevel = [
    "var(--surface-3)",
    `${CHART_COLORS.primary}40`,
    `${CHART_COLORS.primary}80`,
    `${CHART_COLORS.primary}BF`,
    CHART_COLORS.primary,
  ];

  const totalHoras = data.reduce((s, d) => s + d.horas, 0);
  const totalConcluidas = data.reduce((s, d) => s + d.concluidas, 0);
  const activeDays = data.filter((d) => d.horas > 0 || d.concluidas > 0).length;
  const bestDay = data.reduce(
    (best, d) => (d.horas > (best?.horas ?? 0) ? d : best),
    null as null | (typeof data)[number]
  );

  const weekdayLabels = ["Dom", "", "Ter", "", "Qui", "", "Sáb"];

  return (
    <div className="flex flex-col gap-4">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
        }}
      >
        <div
          className="rounded-md p-3"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
            Horas no período
          </div>
          <div className="font-bold mt-1" style={{ fontSize: 22 }}>
            {totalHoras.toFixed(1)}h
          </div>
        </div>
        <div
          className="rounded-md p-3"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
            Tarefas concluídas
          </div>
          <div className="font-bold mt-1" style={{ fontSize: 22 }}>
            {totalConcluidas}
          </div>
        </div>
        <div
          className="rounded-md p-3"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
            Dias ativos
          </div>
          <div className="font-bold mt-1" style={{ fontSize: 22 }}>
            {activeDays}
            <span
              className="text-sm font-normal text-muted"
              style={{ marginLeft: 4 }}
            >
              / {data.length}
            </span>
          </div>
        </div>
        <div
          className="rounded-md p-3"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
            Melhor dia
          </div>
          <div
            className="font-bold mt-1"
            style={{ fontSize: 18, color: "var(--primary)" }}
          >
            {bestDay && bestDay.horas > 0
              ? `${bestDay.label} • ${bestDay.horas.toFixed(1)}h`
              : "—"}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          overflowX: "auto",
          paddingBottom: 6,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateRows: "repeat(7, 1fr)",
            gap: 3,
            flexShrink: 0,
            paddingTop: 2,
          }}
        >
          {weekdayLabels.map((d, i) => (
            <div
              key={i}
              style={{
                fontSize: 10,
                color: "var(--muted-fg)",
                height: 14,
                lineHeight: "14px",
                textAlign: "right",
                paddingRight: 4,
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 3, flex: 1, minWidth: "min-content" }}>
          {weeks.map((week, wi) => (
            <div
              key={wi}
              style={{
                display: "grid",
                gridTemplateRows: "repeat(7, 1fr)",
                gap: 3,
                flex: 1,
                minWidth: 14,
              }}
            >
              {week.map((cell, ci) => {
                if (!cell) {
                  return (
                    <div
                      key={ci}
                      style={{
                        height: 14,
                        borderRadius: 3,
                        background: "transparent",
                      }}
                    />
                  );
                }
                const level = intensity(cell.horas);
                return (
                  <div
                    key={ci}
                    title={`${cell.label}: ${cell.horas.toFixed(1)}h • ${cell.concluidas} concluída(s)`}
                    style={{
                      height: 14,
                      borderRadius: 3,
                      background: colorByLevel[level],
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      transition: "transform 100ms ease",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 justify-end">
        <span className="text-xs text-muted">Menos</span>
        {colorByLevel.map((c, i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: c,
              border: "1px solid var(--border)",
            }}
          />
        ))}
        <span className="text-xs text-muted">Mais</span>
      </div>
    </div>
  );
}

// ─── Period filter ───────────────────────────────────────────────────────────

function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (next: PeriodKey) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-md"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {PERIOD_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--primary)" : "var(--muted-fg)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI Hero ────────────────────────────────────────────────────────────────

function KpiHero({
  label,
  value,
  icon,
  variant = "primary",
  trend,
  trendVariant,
  sparkline,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "purple" | "info";
  trend?: string;
  trendVariant?: "up" | "down" | "neutral";
  sparkline?: number[];
}) {
  const variantColor =
    variant === "success"
      ? CHART_COLORS.success
      : variant === "warning"
      ? CHART_COLORS.warning
      : variant === "danger"
      ? CHART_COLORS.danger
      : variant === "purple"
      ? CHART_COLORS.purple
      : variant === "info"
      ? CHART_COLORS.info
      : CHART_COLORS.primary;

  const trendColor =
    trendVariant === "up"
      ? "var(--success)"
      : trendVariant === "down"
      ? "var(--danger)"
      : "var(--muted-fg)";

  const sparklineData =
    sparkline && sparkline.length > 0
      ? sparkline.map((v, i) => ({ i, v }))
      : null;

  const gradientId = `kpiGrad-${variant}-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div
      style={{
        position: "relative",
        padding: 18,
        borderRadius: 14,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: variantColor,
          opacity: 0.08,
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />
      <div className="flex items-start justify-between gap-2 mb-3" style={{ position: "relative" }}>
        <div
          className="flex items-center justify-center"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: `${variantColor}1A`,
            color: variantColor,
          }}
        >
          {icon}
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full"
            style={{
              color: trendColor,
              fontSize: 11,
              fontWeight: 600,
              background:
                trendVariant === "up"
                  ? "var(--success-soft)"
                  : trendVariant === "down"
                  ? "var(--danger-soft)"
                  : "var(--surface-2)",
            }}
          >
            {trendVariant === "up" ? (
              <TrendingUp size={11} />
            ) : trendVariant === "down" ? (
              <TrendingDown size={11} />
            ) : null}
            {trend}
          </div>
        )}
      </div>

      <div
        className="text-sm mb-1"
        style={{ color: "var(--muted-fg)", fontWeight: 500, position: "relative" }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
          lineHeight: 1.1,
          position: "relative",
        }}
      >
        {value}
      </div>

      {sparklineData && sparklineData.length > 1 && (
        <div style={{ height: 38, marginTop: 10, marginLeft: -4, marginRight: -4 }}>
          <ResponsiveContainer>
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={variantColor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={variantColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={variantColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Status Pill ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge variant="success">Concluída</Badge>;
  if (status === "in_progress") return <Badge variant="info">Em andamento</Badge>;
  return <Badge variant="warning">Pendente</Badge>;
}

// ─── Ranking horizontal com barra integrada ──────────────────────────────────

function RankBarsList({
  data,
  accentColor,
  accentSoft,
  avatarMode = false,
}: {
  data: {
    id: string;
    name: string;
    primary: string;
    secondary: string;
    value: number;
    progress: number;
  }[];
  accentColor: string;
  accentSoft: string;
  avatarMode?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 0.01);

  return (
    <div className="flex flex-col gap-3">
      {data.map((item, idx) => {
        const widthPct = Math.max((item.value / max) * 100, 3);
        return (
          <div
            key={item.id}
            style={{
              padding: 12,
              borderRadius: 10,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              transition: "transform 120ms ease, border-color 120ms ease",
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {avatarMode ? (
                  <Avatar name={item.name} size="sm" />
                ) : (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background:
                        idx === 0
                          ? "#FEF3C7"
                          : idx === 1
                          ? "#E2E8F0"
                          : idx === 2
                          ? "#FED7AA"
                          : "var(--surface-3)",
                      color: "#0F172A",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm truncate"
                    style={{ fontWeight: 600, color: "var(--foreground)" }}
                  >
                    {item.name}
                  </div>
                  <div className="text-xs text-muted truncate">{item.secondary}</div>
                </div>
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: accentColor,
                  whiteSpace: "nowrap",
                }}
              >
                {item.primary}
              </div>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: "var(--surface-3)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${widthPct}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${accentColor}, ${accentSoft})`,
                  borderRadius: 4,
                  transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                  boxShadow: `0 0 0 1px ${accentColor}33 inset`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Hero card com gradiente premium (estilo "My Cards" do Bank Dashboard) ───

function HeroGradientCard({
  totalSeconds,
  completedTasks,
  totalTasks,
  completionRate,
  periodLabel,
}: {
  totalSeconds: number;
  completedTasks: number;
  totalTasks: number;
  completionRate: number;
  periodLabel: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "24px 28px",
        borderRadius: 18,
        background:
          "linear-gradient(135deg, #1E40AF 0%, #2563EB 45%, #4F46E5 100%)",
        color: "#fff",
        overflow: "hidden",
        minHeight: 200,
        boxShadow: "0 20px 40px -20px rgba(37, 99, 235, 0.55)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -60,
          right: -40,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0))",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -90,
          left: -40,
          width: 260,
          height: 260,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.35), rgba(139, 92, 246, 0))",
          pointerEvents: "none",
        }}
      />

      <div className="flex items-center gap-2 mb-3" style={{ position: "relative" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "rgba(255,255,255,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Sparkles size={14} />
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            opacity: 0.9,
          }}
        >
          Visão geral · {periodLabel}
        </div>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          opacity: 0.85,
          marginBottom: 4,
          position: "relative",
        }}
      >
        Tempo total produzido
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          position: "relative",
        }}
      >
        {formatSeconds(totalSeconds)}
      </div>

      <div
        className="flex flex-wrap gap-3 mt-5"
        style={{ position: "relative" }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.14)",
            backdropFilter: "blur(6px)",
            minWidth: 140,
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 500 }}>
            Tarefas concluídas
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              marginTop: 2,
              letterSpacing: "-0.01em",
            }}
          >
            {completedTasks}{" "}
            <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.75 }}>
              / {totalTasks}
            </span>
          </div>
        </div>

        <div
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.14)",
            backdropFilter: "blur(6px)",
            minWidth: 140,
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 500 }}>
            Taxa de conclusão
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              marginTop: 2,
              letterSpacing: "-0.01em",
            }}
          >
            {completionRate}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Clean (estilo CRM.io) ───────────────────────────────────────────────

function KpiClean({
  label,
  value,
  icon,
  trend,
  trendVariant,
  variant = "primary",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  trend?: string;
  trendVariant?: "up" | "down";
  variant?: "primary" | "success" | "warning" | "danger" | "purple" | "info";
}) {
  const color =
    variant === "success"
      ? CHART_COLORS.success
      : variant === "warning"
      ? CHART_COLORS.warning
      : variant === "danger"
      ? CHART_COLORS.danger
      : variant === "purple"
      ? CHART_COLORS.purple
      : variant === "info"
      ? CHART_COLORS.info
      : CHART_COLORS.primary;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `${color}1A`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>
      <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
          lineHeight: 1.15,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {trend && (
        <div
          className="flex items-center gap-1 mt-2"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color:
              trendVariant === "down" ? "var(--danger)" : "var(--success)",
          }}
        >
          {trendVariant === "down" ? (
            <TrendingDown size={12} />
          ) : (
            <TrendingUp size={12} />
          )}
          <span>{trend}</span>
          <span className="text-muted" style={{ fontWeight: 400 }}>
            no período
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Weekly Activity (barras paralelas tipo pill) ────────────────────────────

function WeeklyActivityChart({
  data,
}: {
  data: { date: string; horas: number; concluidas: number; label: string }[];
}) {
  // Limit to last 14 days for visual clarity (estilo Weekly Activity)
  const sliced = data.slice(-14);

  // Convert to chart format: separate horas (deposits) and "criadas" (withdraws)
  const chartData = sliced.map((d) => ({
    label: d.label,
    horas: Number(d.horas.toFixed(1)),
    concluidas: d.concluidas,
  }));

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          barCategoryGap="22%"
          barGap={4}
        >
          <defs>
            <linearGradient id="weeklyHours" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={1} />
              <stop
                offset="100%"
                stopColor={CHART_COLORS.primary}
                stopOpacity={0.5}
              />
            </linearGradient>
            <linearGradient id="weeklyDone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.success} stopOpacity={1} />
              <stop
                offset="100%"
                stopColor={CHART_COLORS.success}
                stopOpacity={0.55}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-fg)" }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-fg)" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(37,99,235,0.05)" }}
          />
          <Bar
            dataKey="horas"
            name="Horas"
            fill="url(#weeklyHours)"
            radius={[8, 8, 8, 8]}
            maxBarSize={14}
          />
          <Bar
            dataKey="concluidas"
            name="Concluídas"
            fill="url(#weeklyDone)"
            radius={[8, 8, 8, 8]}
            maxBarSize={14}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Compact Top Item (estilo "Popular Product" do CRM.io) ───────────────────

function CompactTopItem({
  index,
  icon,
  name,
  sub,
  value,
  accent,
}: {
  index: number;
  icon?: React.ReactNode;
  name: string;
  sub: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="flex items-center gap-3 py-2"
      style={{
        borderBottom: index < 99 ? "1px solid var(--border)" : "none",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `${accent}1A`,
          color: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontWeight: 700,
        }}
      >
        {icon ?? index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-sm truncate"
          style={{ fontWeight: 600, color: "var(--foreground)" }}
        >
          {name}
        </div>
        <div className="text-xs text-muted truncate">{sub}</div>
      </div>
      <div style={{ fontWeight: 700, color: accent, fontSize: 14, whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Ranking row ─────────────────────────────────────────────────────────────

function RankingItem({
  index,
  name,
  sub,
  value,
}: {
  index: number;
  name: string;
  sub: string;
  value: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-3 rounded-md"
      style={{ background: "var(--surface-2)" }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background:
              index === 0
                ? "#FEF3C7"
                : index === 1
                ? "#E2E8F0"
                : index === 2
                ? "#FED7AA"
                : "var(--surface-3)",
            color: "#0F172A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </div>
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{name}</div>
          <div className="text-xs text-muted truncate">{sub}</div>
        </div>
      </div>
      <div className="font-semibold text-sm" style={{ color: "var(--primary)" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Sanitation card ─────────────────────────────────────────────────────────

function SanitationCard({
  projects,
  approvals,
  phases,
}: {
  projects: Project[];
  approvals: Approval[];
  phases: Phase[];
}) {
  const today = getTodayLocalISO();

  const sanitationProjectIds = projects
    .filter((p) => p.discipline === "saneamento")
    .map((p) => p.id);
  const sanProjectsCount = sanitationProjectIds.length;

  const sanApprovals = approvals.filter((a) =>
    sanitationProjectIds.includes(a.project_id)
  );
  const openApprovals = sanApprovals.filter(
    (a) => a.status !== "approved" && a.status !== "rejected" && a.status !== "cancelled"
  );
  const overdueApprovals = openApprovals.filter(
    (a) => a.expected_response_date && a.expected_response_date < today
  );

  const sanPhases = phases.filter((p) => sanitationProjectIds.includes(p.project_id));
  const phaseStats = {
    total: sanPhases.length,
    approved: sanPhases.filter((p) => p.status === "approved").length,
    inProgress: sanPhases.filter(
      (p) => p.status === "in_progress" || p.status === "in_review"
    ).length,
    pending: sanPhases.filter((p) => p.status === "pending").length,
    onHold: sanPhases.filter((p) => p.status === "on_hold").length,
  };

  const overallProgress =
    phaseStats.total > 0
      ? Math.round((phaseStats.approved / phaseStats.total) * 100)
      : 0;

  if (sanProjectsCount === 0) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: `${CHART_COLORS.info}1A`,
              color: CHART_COLORS.info,
            }}
          >
            <Droplets size={18} />
          </div>
          <div>
            <div className="card-title">Carteira de Saneamento</div>
            <p className="text-sm text-muted mt-1">
              Saúde dos projetos de SAA, SES e aprovações externas
            </p>
          </div>
        </div>
        <Badge variant="info">{sanProjectsCount} projeto(s)</Badge>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            padding: 14,
            borderRadius: "var(--radius-md)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={14} className="text-muted" />
            <span className="text-xs text-muted">Projetos ativos</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{sanProjectsCount}</div>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: "var(--radius-md)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck size={14} className="text-muted" />
            <span className="text-xs text-muted">Aprovações em aberto</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: CHART_COLORS.warning }}>
            {openApprovals.length}
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: "var(--radius-md)",
            background: "var(--surface-2)",
            border:
              overdueApprovals.length > 0
                ? `1px solid ${CHART_COLORS.danger}`
                : "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-muted" />
            <span className="text-xs text-muted">Aprovações vencidas</span>
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color:
                overdueApprovals.length > 0
                  ? CHART_COLORS.danger
                  : "var(--foreground)",
            }}
          >
            {overdueApprovals.length}
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: "var(--radius-md)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Layers size={14} className="text-muted" />
            <span className="text-xs text-muted">Avanço médio das fases</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: CHART_COLORS.success }}>
            {overallProgress}%
          </div>
          <Progress value={overallProgress} className="mt-2" variant="success" />
        </div>
      </div>

      {phaseStats.total > 0 && (
        <div className="flex items-center gap-3 flex-wrap mt-4 text-xs">
          <span className="flex items-center gap-1">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: CHART_COLORS.success,
              }}
            />
            <span className="text-muted">
              <strong style={{ color: "var(--foreground)" }}>{phaseStats.approved}</strong>{" "}
              aprovadas
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: CHART_COLORS.primary,
              }}
            />
            <span className="text-muted">
              <strong style={{ color: "var(--foreground)" }}>{phaseStats.inProgress}</strong>{" "}
              em andamento
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: CHART_COLORS.warning,
              }}
            />
            <span className="text-muted">
              <strong style={{ color: "var(--foreground)" }}>{phaseStats.pending}</strong>{" "}
              pendentes
            </span>
          </span>
          {phaseStats.onHold > 0 && (
            <span className="flex items-center gap-1">
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: CHART_COLORS.danger,
                }}
              />
              <span className="text-muted">
                <strong style={{ color: "var(--foreground)" }}>{phaseStats.onHold}</strong>{" "}
                paradas
              </span>
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Dashboard Geral ─────────────────────────────────────────────────────────

function DashboardGeral({
  projects,
  tasks,
  users,
  approvals,
  phases,
  liveSecondsMap,
  period,
}: {
  projects: Project[];
  tasks: Task[];
  users: User[];
  approvals: Approval[];
  phases: Phase[];
  liveSecondsMap: Record<string, number>;
  period: PeriodKey;
}) {
  const filteredTasks = useMemo(
    () => filterTasksByPeriod(tasks, period),
    [tasks, period]
  );

  const previousTasks = useMemo(() => {
    const opt = PERIOD_OPTIONS.find((o) => o.value === period);
    if (!opt || opt.days === null) return [];

    const periodStart = shiftDate(new Date(), -opt.days + 1);
    periodStart.setHours(0, 0, 0, 0);
    const previousStart = shiftDate(periodStart, -opt.days);

    return tasks.filter((task) => {
      if (task.status !== "completed") return false;
      const ref = task.completed_at || task.actual_completed_date;
      if (!ref) return false;
      const t = new Date(ref).getTime();
      return t >= previousStart.getTime() && t < periodStart.getTime();
    });
  }, [tasks, period]);

  const stats = useMemo(() => {
    const totalProjects = projects.length;
    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter((t) => t.status === "completed").length;
    const inProgressTasks = filteredTasks.filter((t) => t.status === "in_progress").length;
    const pendingTasks = filteredTasks.filter((t) => t.status === "pending").length;
    const delayedTasks = filteredTasks.filter(isTaskDelayed).length;
    const totalSeconds = filteredTasks.reduce(
      (s, t) => s + (liveSecondsMap[t.id] ?? 0),
      0
    );
    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const onTimeRate =
      totalTasks > 0
        ? Math.round(((totalTasks - delayedTasks) / totalTasks) * 100)
        : 100;

    return {
      totalProjects,
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      delayedTasks,
      totalSeconds,
      completionRate,
      onTimeRate,
    };
  }, [projects, filteredTasks, liveSecondsMap]);

  const previousStats = useMemo(() => {
    const totalSeconds = previousTasks.reduce(
      (s, t) => s + (t.time_spent_seconds || 0),
      0
    );
    return {
      completedTasks: previousTasks.length,
      totalSeconds,
    };
  }, [previousTasks]);

  function formatTrend(current: number, previous: number) {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) {
      return { text: "Novo período", variant: "neutral" as const };
    }
    const diff = ((current - previous) / previous) * 100;
    const rounded = Math.round(diff);
    return {
      text: `${rounded >= 0 ? "+" : ""}${rounded}% vs período anterior`,
      variant: rounded >= 0 ? ("up" as const) : ("down" as const),
    };
  }

  const completedTrend = formatTrend(stats.completedTasks, previousStats.completedTasks);
  const hoursTrend = formatTrend(stats.totalSeconds, previousStats.totalSeconds);

  const dailySeries = useMemo(() => {
    const opt = PERIOD_OPTIONS.find((o) => o.value === period);
    const days = opt?.days ?? 30;
    return buildDailySeries(filteredTasks, days);
  }, [filteredTasks, period]);

  const statusPieData = useMemo(
    () => [
      { name: "Pendentes", value: stats.pendingTasks, color: CHART_COLORS.warning },
      {
        name: "Em andamento",
        value: stats.inProgressTasks,
        color: CHART_COLORS.primary,
      },
      { name: "Concluídas", value: stats.completedTasks, color: CHART_COLORS.success },
    ],
    [stats]
  );

  const onTimePieData = useMemo(
    () => [
      {
        name: "No prazo",
        value: Math.max(stats.totalTasks - stats.delayedTasks, 0),
        color: CHART_COLORS.success,
      },
      { name: "Em atraso", value: stats.delayedTasks, color: CHART_COLORS.danger },
    ],
    [stats]
  );

  const productivityByProject = useMemo(
    () =>
      projects
        .map((p) => {
          const pt = filteredTasks.filter((t) => t.project_id === p.id);
          const totalSeconds = pt.reduce((s, t) => s + (liveSecondsMap[t.id] ?? 0), 0);
          const completed = pt.filter((t) => t.status === "completed").length;
          return {
            id: p.id,
            name: p.name.length > 22 ? p.name.slice(0, 22) + "…" : p.name,
            horas: Number((totalSeconds / 3600).toFixed(2)),
            tarefas: pt.length,
            concluidas: completed,
            progresso: pt.length > 0 ? Math.round((completed / pt.length) * 100) : 0,
          };
        })
        .filter((p) => p.tarefas > 0)
        .sort((a, b) => b.horas - a.horas),
    [projects, filteredTasks, liveSecondsMap]
  );

  const productivityByUser = useMemo(
    () =>
      users
        .map((u) => {
          const ut = filteredTasks.filter((t) => t.assigned_to === u.id);
          const totalSeconds = ut.reduce((s, t) => s + (liveSecondsMap[t.id] ?? 0), 0);
          return {
            id: u.id,
            name: u.name.length > 18 ? u.name.slice(0, 18) + "…" : u.name,
            fullName: u.name,
            horas: Number((totalSeconds / 3600).toFixed(2)),
            tarefas: ut.length,
            concluidas: ut.filter((t) => t.status === "completed").length,
            atrasadas: ut.filter(isTaskDelayed).length,
          };
        })
        .filter((u) => u.tarefas > 0)
        .sort((a, b) => b.horas - a.horas),
    [users, filteredTasks, liveSecondsMap]
  );

  const delayedTasksDetail = useMemo(() => {
    const today = getTodayLocalISO();
    return filteredTasks
      .filter(isTaskDelayed)
      .map((task) => {
        const project = projects.find((p) => p.id === task.project_id);
        const user = users.find((u) => u.id === task.assigned_to);
        const due = task.planned_due_date;
        const daysLate = due
          ? Math.max(
              Math.floor(
                (new Date(today + "T00:00:00").getTime() -
                  new Date(due + "T00:00:00").getTime()) /
                  (1000 * 60 * 60 * 24)
              ),
              0
            )
          : 0;
        return {
          id: task.id,
          title: task.title,
          projectName: project?.name || "—",
          userName: user?.name || "Sem responsável",
          daysLate,
        };
      })
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 6);
  }, [filteredTasks, projects, users]);

  const periodLabel =
    PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "30 dias";

  return (
    <div className="flex flex-col gap-5">
      {/* ─── ROW 1: Hero gradient + 4 KPIs limpos ─────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1.4fr) minmax(0, 2.6fr)",
          gap: 16,
          alignItems: "stretch",
        }}
        className="dash-grid-hero"
      >
        <HeroGradientCard
          totalSeconds={stats.totalSeconds}
          completedTasks={stats.completedTasks}
          totalTasks={stats.totalTasks}
          completionRate={stats.completionRate}
          periodLabel={periodLabel}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          <KpiClean
            label="Projetos ativos"
            value={stats.totalProjects}
            icon={<FolderKanban size={18} />}
            variant="primary"
          />
          <KpiClean
            label="Tarefas concluídas"
            value={stats.completedTasks}
            icon={<CheckCircle2 size={18} />}
            variant="success"
            trend={completedTrend?.text.replace(" vs período anterior", "")}
            trendVariant={completedTrend?.variant === "down" ? "down" : "up"}
          />
          <KpiClean
            label="Tempo produzido"
            value={formatSeconds(stats.totalSeconds)}
            icon={<Timer size={18} />}
            variant="purple"
            trend={hoursTrend?.text.replace(" vs período anterior", "")}
            trendVariant={hoursTrend?.variant === "down" ? "down" : "up"}
          />
          <KpiClean
            label="Em atraso"
            value={stats.delayedTasks}
            icon={<AlertTriangle size={18} />}
            variant={stats.delayedTasks > 0 ? "danger" : "success"}
            trend={
              stats.delayedTasks > 0
                ? `${Math.round(
                    (stats.delayedTasks / Math.max(stats.totalTasks, 1)) * 100
                  )}% do total`
                : "Tudo no prazo"
            }
            trendVariant={stats.delayedTasks > 0 ? "down" : "up"}
          />
        </div>
      </div>

      {/* ─── Sanitation block ────────────────────────────────── */}
      <SanitationCard projects={projects} approvals={approvals} phases={phases} />

      {/* ─── ROW 2: Weekly Activity + Distribuição por status ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.8fr) minmax(280px, 1fr)",
          gap: 16,
        }}
        className="dash-grid-2-1"
      >
        <Card>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <div className="card-title">Atividade recente</div>
              <p className="text-sm text-muted mt-1">
                Horas e tarefas concluídas por dia
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--muted-fg)", fontWeight: 500 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: CHART_COLORS.primary,
                  }}
                />
                Horas
              </span>
              <span
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--muted-fg)", fontWeight: 500 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: CHART_COLORS.success,
                  }}
                />
                Concluídas
              </span>
            </div>
          </div>
          <WeeklyActivityChart data={dailySeries} />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="card-title">Status das tarefas</div>
              <p className="text-sm text-muted mt-1">
                Distribuição no período
              </p>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              width: "100%",
              height: 200,
              marginBottom: 6,
            }}
          >
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={
                    stats.totalTasks === 0
                      ? [{ name: "Vazio", value: 1, color: "var(--surface-3)" }]
                      : statusPieData
                  }
                  dataKey="value"
                  nameKey="name"
                  outerRadius={86}
                  innerRadius={62}
                  paddingAngle={stats.totalTasks === 0 ? 0 : 3}
                  stroke="var(--surface)"
                  strokeWidth={3}
                  startAngle={90}
                  endAngle={-270}
                >
                  {(stats.totalTasks === 0
                    ? [{ color: "var(--surface-3)" }]
                    : statusPieData
                  ).map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
                {stats.totalTasks > 0 && <Tooltip content={<CustomTooltip />} />}
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "var(--foreground)",
                  lineHeight: 1,
                }}
              >
                {stats.totalTasks}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted-fg)",
                  marginTop: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                }}
              >
                Tarefas
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            {statusPieData.map((s) => {
              const pct =
                stats.totalTasks > 0
                  ? Math.round((s.value / stats.totalTasks) * 100)
                  : 0;
              return (
                <div
                  key={s.name}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: s.color,
                      }}
                    />
                    <span
                      className="text-sm truncate"
                      style={{ color: "var(--foreground)", fontWeight: 500 }}
                    >
                      {s.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs text-muted"
                      style={{ minWidth: 30, textAlign: "right" }}
                    >
                      {pct}%
                    </span>
                    <span
                      className="text-sm"
                      style={{ fontWeight: 700, color: "var(--foreground)" }}
                    >
                      {s.value}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ─── ROW 3: Saúde gauge + Top projetos + Top equipe ──── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(280px, 1fr) minmax(0, 1.4fr) minmax(280px, 1fr)",
          gap: 16,
        }}
        className="dash-grid-3"
      >
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex items-center justify-center"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: `${CHART_COLORS.success}1A`,
                color: CHART_COLORS.success,
              }}
            >
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div className="card-title">Saúde das entregas</div>
              <p className="text-xs text-muted mt-1">% no prazo</p>
            </div>
          </div>
          <HealthGauge
            percent={stats.onTimeRate}
            delayed={onTimePieData[1].value}
            onTime={onTimePieData[0].value}
          />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="card-title">Top projetos</div>
              <p className="text-xs text-muted mt-1">Por horas produzidas</p>
            </div>
            {productivityByProject.length > 5 && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: CHART_COLORS.primary, fontWeight: 600 }}
              >
                Ver todos <ArrowRight size={12} />
              </span>
            )}
          </div>
          {productivityByProject.length === 0 ? (
            <EmptyState
              title="Sem projetos com horas"
              description="As horas vão aparecer aqui assim que a equipe começar a apontar tempo."
            />
          ) : (
            <div>
              {productivityByProject.slice(0, 5).map((p, i) => (
                <CompactTopItem
                  key={p.id}
                  index={i}
                  name={p.name}
                  sub={`${p.tarefas} tarefas • ${p.progresso}% concluído`}
                  value={`${p.horas}h`}
                  accent={CHART_COLORS.primary}
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="card-title">Top equipe</div>
              <p className="text-xs text-muted mt-1">Por horas produzidas</p>
            </div>
          </div>
          {productivityByUser.length === 0 ? (
            <EmptyState
              title="Sem alocações"
              description="Atribua tarefas pra equipe pra ver o ranking."
            />
          ) : (
            <div>
              {productivityByUser.slice(0, 5).map((u, i) => (
                <CompactTopItem
                  key={u.id}
                  index={i}
                  icon={
                    <Avatar
                      name={u.fullName}
                      size="sm"
                    />
                  }
                  name={u.fullName}
                  sub={`${u.tarefas} tarefas • ${u.concluidas} concluídas`}
                  value={`${u.horas}h`}
                  accent={CHART_COLORS.purple}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ─── ROW 4: Atrasos críticos (full width) ────────────── */}
      {delayedTasksDetail.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: `${CHART_COLORS.danger}1A`,
                  color: CHART_COLORS.danger,
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <div>
                <div className="card-title">Atrasos críticos</div>
                <p className="text-sm text-muted mt-1">
                  Top 6 tarefas com maior tempo de atraso
                </p>
              </div>
            </div>
            <Badge variant="danger">{stats.delayedTasks} no total</Badge>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 10,
            }}
          >
            {delayedTasksDetail.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-md"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${CHART_COLORS.danger}`,
                }}
              >
                <Avatar name={item.userName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {item.projectName} • {item.userName}
                  </div>
                </div>
                <Badge variant="danger">
                  {item.daysLate} {item.daysLate === 1 ? "dia" : "dias"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Dashboard de Projeto ────────────────────────────────────────────────────

function DashboardProjeto({
  project,
  tasks,
  users,
  liveSecondsMap,
  period,
}: {
  project: Project;
  tasks: Task[];
  users: User[];
  liveSecondsMap: Record<string, number>;
  period: PeriodKey;
}) {
  const projectTasks = useMemo(
    () =>
      filterTasksByPeriod(
        tasks.filter((t) => t.project_id === project.id),
        period
      ),
    [tasks, project.id, period]
  );

  const stats = useMemo(() => {
    const total = projectTasks.length;
    const completed = projectTasks.filter((t) => t.status === "completed").length;
    const inProgress = projectTasks.filter((t) => t.status === "in_progress").length;
    const pending = projectTasks.filter((t) => t.status === "pending").length;
    const delayed = projectTasks.filter(isTaskDelayed).length;
    const totalSeconds = projectTasks.reduce(
      (s, t) => s + (liveSecondsMap[t.id] ?? 0),
      0
    );
    const avgSeconds = total > 0 ? Math.round(totalSeconds / total) : 0;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      completed,
      inProgress,
      pending,
      delayed,
      totalSeconds,
      avgSeconds,
      progress,
    };
  }, [projectTasks, liveSecondsMap]);

  const userBreakdown = useMemo(() => {
    return users
      .map((u) => {
        const ut = projectTasks.filter((t) => t.assigned_to === u.id);
        if (ut.length === 0) return null;
        const totalSeconds = ut.reduce((s, t) => s + (liveSecondsMap[t.id] ?? 0), 0);
        return {
          id: u.id,
          name: u.name,
          horas: Number((totalSeconds / 3600).toFixed(2)),
          tarefas: ut.length,
          concluidas: ut.filter((t) => t.status === "completed").length,
          atrasadas: ut.filter(isTaskDelayed).length,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.horas - a.horas);
  }, [users, projectTasks, liveSecondsMap]);

  const recentTasks = useMemo(
    () =>
      [...projectTasks]
        .sort((a, b) => {
          const aTime = a.actual_completed_date ?? a.planned_due_date ?? "";
          const bTime = b.actual_completed_date ?? b.planned_due_date ?? "";
          return bTime.localeCompare(aTime);
        })
        .slice(0, 8),
    [projectTasks]
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div>
            <Badge variant="primary">Projeto</Badge>
            <h2
              className="mt-2"
              style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}
            >
              {project.name}
            </h2>
          </div>
          <Progress
            value={stats.progress}
            label="Avanço geral"
            showLabel
            variant={stats.progress === 100 ? "success" : "primary"}
            className="w-full"
          />
        </div>
      </Card>

      <StatsGrid>
        <Stat label="Total de tarefas" value={stats.total} />
        <Stat label="Concluídas" value={stats.completed} />
        <Stat label="Em andamento" value={stats.inProgress} />
        <Stat label="Em atraso" value={stats.delayed} />
        <Stat label="Tempo produzido" value={formatSeconds(stats.totalSeconds)} />
        <Stat label="Tempo médio/tarefa" value={formatSeconds(stats.avgSeconds)} />
      </StatsGrid>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="card-title">Horas por colaborador</div>
            <p className="text-sm text-muted mt-1">Carga distribuída neste projeto</p>
          </div>
        </div>
        {userBreakdown.length === 0 ? (
          <EmptyState
            title="Sem alocações"
            description="Atribua tarefas pra colaboradores neste projeto pra ver o gráfico."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {userBreakdown.map((item, i) => (
              <RankingItem
                key={item.id}
                index={i}
                name={item.name}
                sub={`${item.tarefas} tarefas • ${item.concluidas} concluídas • ${item.atrasadas} atrasadas`}
                value={`${item.horas}h`}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="card-title">Tarefas recentes</div>
            <p className="text-sm text-muted mt-1">Últimas 8 do projeto</p>
          </div>
        </div>
        {recentTasks.length === 0 ? (
          <EmptyState
            title="Nenhuma tarefa criada"
            description="Crie tarefas neste projeto pra começar a medir produção."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {recentTasks.map((task) => {
              const assignedUser = users.find((u) => u.id === task.assigned_to);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 rounded-md"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span className="flex-1 text-sm font-medium truncate">
                    {task.title}
                  </span>
                  {assignedUser && <Avatar name={assignedUser.name} size="sm" />}
                  <StatusBadge status={task.status} />
                  <span
                    className="text-xs text-muted"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {formatSeconds(liveSecondsMap[task.id] ?? 0)}
                  </span>
                  {isTaskDelayed(task) && <Badge variant="danger">Atrasada</Badge>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Skeleton state ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <StatsGrid>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </StatsGrid>
      <Card>
        <Skeleton style={{ height: 280, width: "100%" }} />
      </Card>
      <div className="grid-2">
        <Card>
          <Skeleton style={{ height: 280, width: "100%" }} />
        </Card>
        <Card>
          <Skeleton style={{ height: 280, width: "100%" }} />
        </Card>
      </div>
      <Card>
        <Skeleton style={{ height: 320, width: "100%" }} />
      </Card>
    </div>
  );
}

// ─── Dashboard de Disciplina ─────────────────────────────────────────────────

function DashboardDisciplina({
  discipline,
  projects,
  tasks,
  users,
  approvals,
  phases,
  liveSecondsMap,
  period,
}: {
  discipline: string;
  projects: Project[];
  tasks: Task[];
  users: User[];
  approvals: Approval[];
  phases: Phase[];
  liveSecondsMap: Record<string, number>;
  period: PeriodKey;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const disciplineProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);

  const disciplineTasks = useMemo(
    () => tasks.filter((t) => disciplineProjectIds.has(t.project_id)),
    [tasks, disciplineProjectIds]
  );

  const filteredTasks = useMemo(
    () =>
      filterTasksByPeriod(
        selectedProjectId
          ? disciplineTasks.filter((t) => t.project_id === selectedProjectId)
          : disciplineTasks,
        period
      ),
    [disciplineTasks, selectedProjectId, period]
  );

  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.status === "completed").length;
    const inProgress = filteredTasks.filter((t) => t.status === "in_progress").length;
    const pending = filteredTasks.filter((t) => t.status === "pending").length;
    const delayed = filteredTasks.filter(isTaskDelayed).length;
    const totalSeconds = filteredTasks.reduce((s, t) => s + (liveSecondsMap[t.id] ?? 0), 0);
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const onTimeRate = total > 0 ? Math.round(((total - delayed) / total) * 100) : 100;
    return { total, completed, inProgress, pending, delayed, totalSeconds, completionRate, onTimeRate };
  }, [filteredTasks, liveSecondsMap]);

  const projectCards = useMemo(() =>
    projects.map((p) => {
      const pt = filterTasksByPeriod(tasks.filter((t) => t.project_id === p.id), period);
      const totalSeconds = pt.reduce((s, t) => s + (liveSecondsMap[t.id] ?? 0), 0);
      const completed = pt.filter((t) => t.status === "completed").length;
      const inProgress = pt.filter((t) => t.status === "in_progress").length;
      const delayed = pt.filter(isTaskDelayed).length;
      const progress = pt.length > 0 ? Math.round((completed / pt.length) * 100) : 0;
      const sanApprovals = approvals.filter((a) => a.project_id === p.id);
      const openApprovals = sanApprovals.filter(
        (a) => !["approved", "rejected", "cancelled"].includes(a.status)
      ).length;
      return { id: p.id, name: p.name, totalTasks: pt.length, completed, inProgress, delayed, totalSeconds, progress, openApprovals };
    }),
    [projects, tasks, period, liveSecondsMap, approvals]
  );

  const selectedProject = selectedProjectId ? projects.find((p) => p.id === selectedProjectId) ?? null : null;

  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "30 dias";

  return (
    <div className="flex flex-col gap-5">
      {/* ── Filtro de projeto ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "12px 16px",
        }}
      >
        <span className="text-xs font-semibold text-muted" style={{ marginRight: 4, whiteSpace: "nowrap" }}>
          Filtrar por projeto:
        </span>

        <button
          onClick={() => setSelectedProjectId(null)}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid",
            borderColor: !selectedProjectId ? "var(--primary)" : "var(--border)",
            background: !selectedProjectId ? "var(--primary)" : "transparent",
            color: !selectedProjectId ? "#fff" : "var(--muted-fg)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          Todos ({projects.length})
        </button>

        {projects.map((p) => {
          const isActive = selectedProjectId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(isActive ? null : p.id)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid",
                borderColor: isActive ? "var(--primary)" : "var(--border)",
                background: isActive ? "var(--primary)" : "transparent",
                color: isActive ? "#fff" : "var(--foreground)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* ── Se projeto selecionado: detalhe do projeto ── */}
      {selectedProject ? (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedProjectId(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--muted-fg)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontWeight: 500,
              }}
            >
              ← Todos os projetos de {getDisciplineLabel(discipline)}
            </button>
          </div>
          <DashboardProjeto
            project={selectedProject}
            tasks={tasks}
            users={users}
            liveSecondsMap={liveSecondsMap}
            period={period}
          />
        </>
      ) : (
        <>
          {/* ── KPIs agregados ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 14,
            }}
          >
            <KpiClean
              label="Projetos"
              value={projects.length}
              icon={<FolderKanban size={18} />}
            />
            <KpiClean
              label="Tarefas no período"
              value={stats.total}
              icon={<ClipboardCheck size={18} />}
            />
            <KpiClean
              label="Concluídas"
              value={stats.completed}
              icon={<CheckCircle2 size={18} />}
              variant="success"
            />
            <KpiClean
              label="Em atraso"
              value={stats.delayed}
              icon={<AlertTriangle size={18} />}
              variant={stats.delayed > 0 ? "danger" : "success"}
            />
            <KpiClean
              label="Horas produzidas"
              value={`${(stats.totalSeconds / 3600).toFixed(1)}h`}
              icon={<Timer size={18} />}
              variant="purple"
            />
            <KpiClean
              label="Taxa de conclusão"
              value={`${stats.completionRate}%`}
              icon={<TrendingUp size={18} />}
              variant="info"
            />
          </div>

          {/* ── Cards de projetos ── */}
          <div>
            <h3 className="text-sm font-semibold text-muted mb-3" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Projetos · {periodLabel}
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              {projectCards.map((pc) => (
                <button
                  key={pc.id}
                  onClick={() => setSelectedProjectId(pc.id)}
                  style={{
                    textAlign: "left",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: "18px 20px",
                    cursor: "pointer",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--primary)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 3px var(--primary-soft)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                  }}
                >
                  {/* Nome + badge atraso */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-semibold text-sm" style={{ lineHeight: 1.4 }}>
                      {pc.name}
                    </div>
                    {pc.delayed > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: "var(--danger-soft)",
                          color: "var(--danger)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {pc.delayed} atrasada{pc.delayed > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Barra de progresso */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted">Progresso</span>
                      <span className="text-xs font-bold" style={{ color: pc.progress === 100 ? "var(--success)" : "var(--primary)" }}>
                        {pc.progress}%
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "var(--surface-3)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${pc.progress}%`,
                          height: "100%",
                          borderRadius: 3,
                          background: pc.progress === 100
                            ? CHART_COLORS.success
                            : `linear-gradient(90deg, ${CHART_COLORS.primary}, ${CHART_COLORS.primaryLight})`,
                          transition: "width 600ms ease",
                        }}
                      />
                    </div>
                  </div>

                  {/* Mini stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px" }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Tarefas</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{pc.totalTasks}</div>
                    </div>
                    <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px" }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Horas</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{(pc.totalSeconds / 3600).toFixed(1)}h</div>
                    </div>
                    <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px" }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Concluídas</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--success)" }}>{pc.completed}</div>
                    </div>
                  </div>

                  {pc.openApprovals > 0 && (
                    <div
                      className="flex items-center gap-2 mt-3"
                      style={{
                        fontSize: 11,
                        color: "var(--warning-fg)",
                        background: "var(--warning-soft)",
                        borderRadius: 6,
                        padding: "5px 10px",
                      }}
                    >
                      <ClipboardCheck size={11} />
                      {pc.openApprovals} aprovação(ões) pendente(s)
                    </div>
                  )}

                  <div
                    className="flex items-center gap-1 mt-3"
                    style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600 }}
                  >
                    Ver dashboard completo <ArrowRight size={11} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("geral");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [, setClock] = useState(0);

  const hasRunningTimer = useMemo(
    () => tasks.some((t) => t.is_timer_running),
    [tasks]
  );

  useEffect(() => {
    if (!hasRunningTimer) return;
    const interval = setInterval(() => setClock((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError(null);

      const profile = await getCurrentProfile();
      if (!profile) {
        setError("Não foi possível carregar seu perfil. Faça login novamente.");
        setLoading(false);
        return;
      }
      setMyRole(profile.role);

      const [projectsResponse, tasksResponse, usersResponse, approvalsResponse, phasesResponse] =
        await Promise.all([
          supabase
            .from("projects")
            .select("id, name, discipline")
            .order("name", { ascending: true }),
          supabase
            .from("tasks")
            .select(
              "id, title, status, project_id, assigned_to, created_by, planned_due_date, actual_completed_date, completed_at, created_at, time_spent_seconds, is_timer_running, started_at"
            ),
          supabase
            .from("users")
            .select("id, name, role")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase
            .from("external_approvals")
            .select("id, project_id, status, expected_response_date"),
          supabase.from("project_phases").select("id, project_id, status"),
        ]);

      if (
        projectsResponse.error ||
        tasksResponse.error ||
        usersResponse.error
      ) {
        const msg =
          projectsResponse.error?.message ||
          tasksResponse.error?.message ||
          usersResponse.error?.message ||
          "Erro desconhecido";
        setError(`Erro ao carregar dados: ${msg}`);
        setLoading(false);
        return;
      }

      const rawTasks = (tasksResponse.data as Task[]) || [];
      const rawUsers =
        (usersResponse.data as { id: string; name: string; role: string | null }[]) || [];

      const viewTasks = filterTasksForDashboard(rawTasks, profile.id, profile.role) as Task[];
      const viewUsersRows = filterUsersForDashboard(rawUsers, profile.id, profile.role);
      const viewUsers: User[] = viewUsersRows.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      }));

      const projectIds = new Set((projectsResponse.data as Project[] | null)?.map((p) => p.id) ?? []);
      const rawApprovals = (approvalsResponse.data as Approval[]) || [];
      const rawPhases = (phasesResponse.data as Phase[]) || [];

      setProjects((projectsResponse.data as Project[]) || []);
      setTasks(viewTasks);
      setUsers(viewUsers);
      setApprovals(rawApprovals.filter((a) => projectIds.has(a.project_id)));
      setPhases(rawPhases.filter((ph) => projectIds.has(ph.project_id)));
      setLoading(false);
    }

    loadDashboard();
  }, []);

  const liveSecondsMap = useMemo(
    () => Object.fromEntries(tasks.map((t) => [t.id, getLiveSeconds(t)])),
    [tasks]
  );

  const disciplines = useMemo(
    () => [...new Set(projects.map((p) => p.discipline).filter(Boolean))] as string[],
    [projects]
  );

  const activeDisciplineProjects = useMemo(
    () => (activeTab !== "geral" ? projects.filter((p) => p.discipline === activeTab) : []),
    [projects, activeTab]
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          !loading && myRole && !hasFullPortfolioAccess(myRole)
            ? isNarrowProjetista(myRole)
              ? "Visão restrita: apenas projetos e tarefas vinculados a você."
              : "Rendimento da sua equipe (projetistas e projetistas líderes); cargos acima do seu não entram nos gráficos por pessoa."
            : "Produtividade, tempo, tarefas e desempenho da equipe em um só lugar."
        }
        actions={
          !loading && projects.length > 0 ? (
            <PeriodFilter value={period} onChange={setPeriod} />
          ) : undefined
        }
      />

      {!loading && !error && projects.length > 0 && (
        <div className="mb-6">
          <div className="tabs" style={{ maxWidth: "100%", overflowX: "auto" }}>
            <button
              className="tab"
              data-active={activeTab === "geral" ? "true" : "false"}
              onClick={() => setActiveTab("geral")}
            >
              <Activity size={14} />
              Visão geral
            </button>
            {disciplines.map((disc) => (
              <button
                key={disc}
                className="tab"
                data-active={activeTab === disc ? "true" : "false"}
                onClick={() => setActiveTab(disc)}
              >
                {getDisciplineIcon(disc)}
                {getDisciplineLabel(disc)}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <Card>
          <div className="flex items-center gap-3" style={{ color: "var(--danger)" }}>
            <AlertTriangle size={20} />
            <span>{error}</span>
          </div>
        </Card>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={22} />}
          title="Comece criando seu primeiro projeto"
          description="Pra ver dados aqui, crie projetos e tarefas e os números vão aparecer em tempo real."
        />
      ) : activeTab === "geral" ? (
        <DashboardGeral
          projects={projects}
          tasks={tasks}
          users={users}
          approvals={approvals}
          phases={phases}
          liveSecondsMap={liveSecondsMap}
          period={period}
        />
      ) : activeDisciplineProjects.length > 0 ? (
        <DashboardDisciplina
          discipline={activeTab}
          projects={activeDisciplineProjects}
          tasks={tasks}
          users={users}
          approvals={approvals}
          phases={phases}
          liveSecondsMap={liveSecondsMap}
          period={period}
        />
      ) : null}
    </div>
  );
}
