"use client";

import { Avatar } from "@/components/ui/avatar";
import { MapPin } from "lucide-react";

export type TimelineMeeting = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  room_id: string | null;
  participantIds: string[];
};

export type TimelineRow =
  | { kind: "user"; id: string; name: string; subtitle?: string }
  | {
      kind: "room";
      id: string;
      name: string;
      subtitle?: string;
    };

export function AvailabilityTimeline({
  rows,
  meetings,
  date,
  startHour = 7,
  endHour = 20,
  selection,
  onClickHour,
}: {
  rows: TimelineRow[];
  meetings: TimelineMeeting[];
  date: string; // YYYY-MM-DD
  startHour?: number;
  endHour?: number;
  /** Início e fim selecionados, em "HH:MM". Quando definidos, desenha um bloco azul. */
  selection?: { start: string; end: string } | null;
  /** Permite clicar em uma hora pra setar inicio = HH:00. */
  onClickHour?: (hour: number) => void;
}) {
  const totalHours = endHour - startHour;
  const colWidth = 48; // px por hora

  const dayStart = new Date(`${date}T00:00:00`).getTime();
  const baseMinutes = startHour * 60;
  const totalMinutes = totalHours * 60;

  function pctFromTime(iso: string) {
    const t = new Date(iso).getTime();
    const minutesFromDayStart = Math.max(0, (t - dayStart) / 60000);
    const minutesFromBase = minutesFromDayStart - baseMinutes;
    return Math.min(100, Math.max(0, (minutesFromBase / totalMinutes) * 100));
  }

  function pctFromHHMM(hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const minutes = h * 60 + m - baseMinutes;
    return Math.min(100, Math.max(0, (minutes / totalMinutes) * 100));
  }

  function rowMatches(row: TimelineRow, m: TimelineMeeting) {
    if (row.kind === "user") return m.participantIds.includes(row.id);
    return m.room_id === row.id;
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          minWidth: 360 + totalHours * colWidth,
        }}
      >
        {/* Coluna de labels */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            background: "var(--surface-2)",
            borderRight: "1px solid var(--border)",
          }}
        >
          {/* Cabeçalho da coluna esquerda */}
          <div
            style={{
              height: 38,
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              borderBottom: "1px solid var(--border)",
            }}
          >
            Participantes
          </div>

          {rows.map((row) => (
            <div
              key={`${row.kind}-${row.id}`}
              style={{
                height: 44,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 12px",
                borderBottom: "1px solid var(--border)",
                minWidth: 0,
              }}
            >
              {row.kind === "user" ? (
                <Avatar name={row.name} size="sm" />
              ) : (
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: "var(--primary-soft)",
                    color: "var(--primary)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={13} />
                </span>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {row.name}
                </div>
                {row.subtitle && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.subtitle}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Grid de horas */}
        <div
          style={{
            flex: 1,
            position: "relative",
            overflowX: "auto",
          }}
        >
          {/* Cabeçalho de horas */}
          <div
            style={{
              display: "flex",
              height: 38,
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
            }}
          >
            {Array.from({ length: totalHours }).map((_, i) => {
              const hour = startHour + i;
              return (
                <div
                  key={hour}
                  onClick={() => onClickHour?.(hour)}
                  style={{
                    width: colWidth,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--muted)",
                    borderRight: "1px solid var(--border)",
                    cursor: onClickHour ? "pointer" : "default",
                  }}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              );
            })}
          </div>

          {/* Linhas */}
          {rows.map((row) => {
            const rowMeetings = meetings.filter((m) => rowMatches(row, m));
            return (
              <div
                key={`grid-${row.kind}-${row.id}`}
                style={{
                  position: "relative",
                  display: "flex",
                  height: 44,
                  borderBottom: "1px solid var(--border)",
                  background:
                    row.kind === "room" ? "var(--surface-2)" : "var(--surface)",
                }}
              >
                {/* Linhas verticais (horas) */}
                {Array.from({ length: totalHours }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: colWidth,
                      flexShrink: 0,
                      borderRight: "1px solid var(--border)",
                    }}
                  />
                ))}

                {/* Reuniões existentes (vermelhinho) */}
                {rowMeetings.map((m) => {
                  const left = pctFromTime(m.start_time);
                  const right = pctFromTime(m.end_time);
                  const width = Math.max(0.5, right - left);
                  return (
                    <div
                      key={m.id}
                      title={`${m.title} — ${formatHHMM(m.start_time)} a ${formatHHMM(m.end_time)}`}
                      style={{
                        position: "absolute",
                        top: 6,
                        height: 32,
                        left: `${left}%`,
                        width: `${width}%`,
                        background:
                          "linear-gradient(180deg, color-mix(in srgb, var(--danger) 25%, transparent), color-mix(in srgb, var(--danger) 18%, transparent))",
                        border:
                          "1px solid color-mix(in srgb, var(--danger) 45%, transparent)",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--danger)",
                        padding: "0 6px",
                        display: "flex",
                        alignItems: "center",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {m.title}
                    </div>
                  );
                })}

                {/* Bloco da seleção atual (azul) */}
                {selection && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${pctFromHHMM(selection.start)}%`,
                      width: `${
                        Math.max(0, pctFromHHMM(selection.end)) -
                        pctFromHHMM(selection.start)
                      }%`,
                      background:
                        "linear-gradient(180deg, color-mix(in srgb, var(--primary) 22%, transparent), color-mix(in srgb, var(--primary) 12%, transparent))",
                      border:
                        "2px solid color-mix(in srgb, var(--primary) 70%, transparent)",
                      borderRadius: 6,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 12px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)",
          fontSize: 11,
          color: "var(--muted)",
        }}
      >
        <LegendDot
          color="color-mix(in srgb, var(--danger) 40%, transparent)"
          border="color-mix(in srgb, var(--danger) 70%, transparent)"
          label="Ocupado"
        />
        <LegendDot
          color="color-mix(in srgb, var(--primary) 25%, transparent)"
          border="color-mix(in srgb, var(--primary) 70%, transparent)"
          label="Sua reunião"
        />
        <span style={{ marginLeft: "auto" }}>
          Clique no horário pra preencher o início.
        </span>
      </div>
    </div>
  );
}

function LegendDot({
  color,
  border,
  label,
}: {
  color: string;
  border: string;
  label: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 14,
          height: 10,
          background: color,
          border: `1px solid ${border}`,
          borderRadius: 3,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

function formatHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
