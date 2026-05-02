"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Play,
  Square,
  CalendarDays,
  Activity,
  Trash2,
  Save,
  Pencil,
  X,
  CheckCircle2,
  Users as UsersIcon,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { getCurrentProfile, type CurrentProfile } from "@/lib/supabase/profile";
import { canAccessPontoTeamViews } from "@/lib/permissions";
import { supabase } from "@/lib/supabase/client";
import {
  clockIn,
  clockOut,
  deleteEntry,
  endOfDayISO,
  endOfMonthISO,
  entryDurationSeconds,
  formatDuration,
  formatDurationCompact,
  getOpenEntry,
  groupByLocalDay,
  listAllEntries,
  listMyEntries,
  monthRange,
  startOfDayISO,
  startOfMonthISO,
  startOfWeekISO,
  sumDurationSeconds,
  updateEntryNotes,
  type TimeEntry,
  type TimeEntryWithUser,
} from "@/lib/ponto/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Helpers de formatação ─────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// ─── Componentes auxiliares ────────────────────────────────────────────────

function StatTile({
  label,
  value,
  hint,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  color?: string;
}) {
  const accent = color || "var(--primary)";
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--muted)",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {icon && (
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </span>
        )}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────────────

type TabKey = "me" | "admin" | "report";

export default function PontoPage() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [tab, setTab] = useState<TabKey>("me");

  useEffect(() => {
    getCurrentProfile().then((p) => {
      setProfile(p);
      setLoadingProfile(false);
    });
  }, []);

  const canTeamViews = canAccessPontoTeamViews(profile?.role);

  if (loadingProfile) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton style={{ height: 32, width: 220 }} />
        <Skeleton style={{ height: 220 }} />
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        title="Não foi possível carregar seu perfil"
        description="Atualize a página ou faça login novamente."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ponto"
        description="Registre seu expediente em duas batidas: iniciar e encerrar."
      />

      {canTeamViews && (
        <div className="tabs" style={{ alignSelf: "flex-start" }}>
          <button
            className="tab"
            data-active={tab === "me" ? "true" : "false"}
            onClick={() => setTab("me")}
          >
            <Clock size={14} />
            Meu ponto
          </button>
          <button
            className="tab"
            data-active={tab === "admin" ? "true" : "false"}
            onClick={() => setTab("admin")}
          >
            <UsersIcon size={14} />
            Equipe
          </button>
          <button
            className="tab"
            data-active={tab === "report" ? "true" : "false"}
            onClick={() => setTab("report")}
          >
            <CalendarDays size={14} />
            Espelho mensal
          </button>
        </div>
      )}

      {tab === "me" && <MyPontoTab profile={profile} />}
      {tab === "admin" && canTeamViews && <TeamTab />}
      {tab === "report" && canTeamViews && <MonthlyReportTab />}
    </div>
  );
}

// ─── Tab: meu ponto ────────────────────────────────────────────────────────

function MyPontoTab({ profile }: { profile: CurrentProfile }) {
  const [openEntry, setOpenEntry] = useState<TimeEntry | null>(null);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Inputs
  const [notesIn, setNotesIn] = useState("");
  const [notesOut, setNotesOut] = useState("");

  // Edição inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState("");

  // Confirmar exclusão
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    const [open, recent] = await Promise.all([
      getOpenEntry(profile.id),
      listMyEntries(profile.id, {
        from: startOfMonthISO(),
        to: endOfDayISO(),
        limit: 200,
      }),
    ]);
    setOpenEntry(open);
    setAllEntries(recent);
    if (!opts?.silent) setLoading(false);
  }

  useEffect(() => {
    load();
  }, [profile.id]);

  // Cronômetro ao vivo
  useEffect(() => {
    if (!openEntry) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [openEntry]);

  // Stats
  const today = useMemo(() => {
    const fromTs = new Date(startOfDayISO()).getTime();
    return allEntries.filter((e) => new Date(e.clock_in).getTime() >= fromTs);
  }, [allEntries]);
  const week = useMemo(() => {
    const fromTs = new Date(startOfWeekISO()).getTime();
    return allEntries.filter((e) => new Date(e.clock_in).getTime() >= fromTs);
  }, [allEntries]);
  const month = allEntries; // já carregamos do início do mês

  const todaySeconds = sumDurationSeconds(today, new Date(now));
  const weekSeconds = sumDurationSeconds(week, new Date(now));
  const monthSeconds = sumDurationSeconds(month, new Date(now));

  async function handleClockIn() {
    if (working || openEntry) return;
    setWorking(true);
    const optimistic: TimeEntry = {
      id: `tmp-${Date.now()}`,
      user_id: profile.id,
      clock_in: new Date().toISOString(),
      clock_out: null,
      notes: notesIn || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setOpenEntry(optimistic);
    setAllEntries((prev) => [optimistic, ...prev]);

    const { data, error } = await clockIn(profile.id, notesIn || null);
    if (error || !data) {
      setOpenEntry(null);
      setAllEntries((prev) => prev.filter((e) => e.id !== optimistic.id));
      alert(`Erro ao iniciar expediente: ${error}`);
    } else {
      setOpenEntry(data);
      setAllEntries((prev) => {
        const filtered = prev.filter((e) => e.id !== optimistic.id);
        return [data, ...filtered];
      });
    }
    setNotesIn("");
    setWorking(false);
  }

  async function handleClockOut() {
    if (working || !openEntry) return;
    setWorking(true);
    const previousOpen = openEntry;
    const closed: TimeEntry = {
      ...openEntry,
      clock_out: new Date().toISOString(),
      notes: notesOut || openEntry.notes,
    };
    setOpenEntry(null);
    setAllEntries((prev) =>
      prev.map((e) => (e.id === closed.id ? closed : e))
    );

    const { data, error } = await clockOut(
      previousOpen.id,
      notesOut !== "" ? notesOut : undefined
    );
    if (error || !data) {
      setOpenEntry(previousOpen);
      setAllEntries((prev) =>
        prev.map((e) => (e.id === previousOpen.id ? previousOpen : e))
      );
      alert(`Erro ao encerrar expediente: ${error}`);
    } else {
      setAllEntries((prev) => prev.map((e) => (e.id === data.id ? data : e)));
    }
    setNotesOut("");
    setWorking(false);
  }

  async function handleSaveNotes(id: string) {
    const previous = allEntries.find((e) => e.id === id) || null;
    setAllEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, notes: editingNotes || null } : e))
    );
    setEditingId(null);
    const { error } = await updateEntryNotes(id, editingNotes || null);
    if (error && previous) {
      setAllEntries((prev) => prev.map((e) => (e.id === id ? previous : e)));
      alert(`Erro ao salvar: ${error}`);
    }
  }

  async function handleDelete(id: string) {
    const previous = allEntries;
    setAllEntries((prev) => prev.filter((e) => e.id !== id));
    if (openEntry?.id === id) setOpenEntry(null);
    setConfirmDeleteId(null);
    const { error } = await deleteEntry(id);
    if (error) {
      setAllEntries(previous);
      alert(`Erro ao excluir: ${error}`);
    }
  }

  const liveSeconds = openEntry
    ? entryDurationSeconds(openEntry, new Date(now))
    : 0;

  const grouped = useMemo(() => groupByLocalDay(allEntries), [allEntries]);
  const sortedDayKeys = useMemo(
    () => Array.from(grouped.keys()).sort((a, b) => (a < b ? 1 : -1)),
    [grouped]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* HERO de batida */}
      <ClockHero
        openEntry={openEntry}
        liveSeconds={liveSeconds}
        notesIn={notesIn}
        setNotesIn={setNotesIn}
        notesOut={notesOut}
        setNotesOut={setNotesOut}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
        working={working}
      />

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <StatTile
          icon={<Clock size={13} />}
          label="Hoje"
          value={formatDuration(todaySeconds)}
          hint={`${today.length} batida${today.length === 1 ? "" : "s"}`}
          color="var(--primary)"
        />
        <StatTile
          icon={<CalendarDays size={13} />}
          label="Esta semana"
          value={formatDurationCompact(weekSeconds)}
          hint="Segunda → hoje"
          color="var(--success)"
        />
        <StatTile
          icon={<Activity size={13} />}
          label="Este mês"
          value={formatDurationCompact(monthSeconds)}
          hint={`${month.length} registros no mês`}
          color="var(--warning)"
        />
        <StatTile
          icon={<CheckCircle2 size={13} />}
          label="Status"
          value={openEntry ? "Em expediente" : "Fora"}
          hint={
            openEntry
              ? `Iniciado às ${formatTime(openEntry.clock_in)}`
              : "Bata o ponto pra começar"
          }
          color={openEntry ? "var(--success)" : "var(--muted)"}
        />
      </div>

      {/* Lista por dia */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <div className="card-title">Histórico do mês</div>
            <p className="text-sm text-muted mt-1">
              {MONTH_NAMES[new Date().getMonth()]} de{" "}
              {new Date().getFullYear()} — agrupado por dia.
            </p>
          </div>
        </div>

        {loading ? (
          <Skeleton style={{ height: 120 }} />
        ) : allEntries.length === 0 ? (
          <EmptyState
            icon={<Clock size={20} />}
            title="Sem batidas neste mês"
            description="Inicie um expediente acima para começar a registrar."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {sortedDayKeys.map((dayKey) => {
              const dayEntries = grouped.get(dayKey) || [];
              const totalSec = sumDurationSeconds(dayEntries, new Date(now));
              return (
                <div
                  key={dayKey}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="flex items-center justify-between flex-wrap gap-2"
                    style={{
                      padding: "10px 14px",
                      background: "var(--surface-2)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                        textTransform: "capitalize",
                      }}
                    >
                      {formatDayLabel(dayKey)}
                    </div>
                    <Badge variant="primary">
                      {formatDurationCompact(totalSec)}
                    </Badge>
                  </div>
                  <div className="flex flex-col">
                    {dayEntries.map((e) => {
                      const open = e.clock_out === null;
                      const isEditing = editingId === e.id;
                      const isConfirming = confirmDeleteId === e.id;
                      return (
                        <div
                          key={e.id}
                          className="flex items-center flex-wrap gap-3"
                          style={{
                            padding: "10px 14px",
                            borderTop: "1px solid var(--border)",
                            background: open
                              ? "color-mix(in srgb, var(--success) 6%, transparent)"
                              : "var(--surface)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 220,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: open
                                  ? "var(--success)"
                                  : "var(--muted)",
                                animation: open
                                  ? "pulse 1.6s ease-in-out infinite"
                                  : undefined,
                              }}
                            />
                            <span
                              style={{
                                fontVariantNumeric: "tabular-nums",
                                fontWeight: 600,
                              }}
                            >
                              {formatTime(e.clock_in)} →{" "}
                              {open ? (
                                <span
                                  style={{
                                    color: "var(--success)",
                                    fontWeight: 700,
                                  }}
                                >
                                  agora
                                </span>
                              ) : (
                                formatTime(e.clock_out!)
                              )}
                            </span>
                          </div>
                          <div
                            style={{
                              minWidth: 100,
                              fontVariantNumeric: "tabular-nums",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--muted)",
                            }}
                          >
                            {formatDuration(
                              entryDurationSeconds(e, new Date(now))
                            )}
                          </div>
                          {isEditing ? (
                            <div
                              className="flex items-center gap-2 flex-wrap"
                              style={{ flex: 1, minWidth: 200 }}
                            >
                              <Input
                                value={editingNotes}
                                onChange={(ev) =>
                                  setEditingNotes(ev.target.value)
                                }
                                placeholder="Observação"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleSaveNotes(e.id)}
                                leftIcon={<Save size={12} />}
                              >
                                Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingId(null)}
                              >
                                <X size={12} />
                              </Button>
                            </div>
                          ) : (
                            <div
                              style={{
                                flex: 1,
                                minWidth: 100,
                                fontSize: 13,
                                color: e.notes
                                  ? "var(--text)"
                                  : "var(--muted)",
                              }}
                            >
                              {e.notes || "—"}
                            </div>
                          )}
                          {!isEditing && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                title="Editar observação"
                                onClick={() => {
                                  setEditingId(e.id);
                                  setEditingNotes(e.notes || "");
                                }}
                              >
                                <Pencil size={13} />
                              </Button>
                              {isConfirming ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleDelete(e.id)}
                                  >
                                    Excluir
                                  </Button>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => setConfirmDeleteId(null)}
                                  >
                                    <X size={12} />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="icon-sm"
                                  variant="danger-ghost"
                                  title="Excluir batida"
                                  onClick={() => setConfirmDeleteId(e.id)}
                                >
                                  <Trash2 size={13} />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Hero de batida ────────────────────────────────────────────────────────

function ClockHero({
  openEntry,
  liveSeconds,
  notesIn,
  setNotesIn,
  notesOut,
  setNotesOut,
  onClockIn,
  onClockOut,
  working,
}: {
  openEntry: TimeEntry | null;
  liveSeconds: number;
  notesIn: string;
  setNotesIn: (v: string) => void;
  notesOut: string;
  setNotesOut: (v: string) => void;
  onClockIn: () => void;
  onClockOut: () => void;
  working: boolean;
}) {
  const isOpen = !!openEntry;
  const accent = isOpen ? "var(--success)" : "var(--primary)";
  const accentSoft = isOpen ? "var(--success-soft)" : "var(--primary-soft)";

  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent))`,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(700px 220px at 100% 0%, ${accentSoft}, transparent 60%)`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          padding: "24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 320px)",
          gap: 24,
          alignItems: "center",
        }}
        className="ponto-hero"
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              borderRadius: 999,
              background: accentSoft,
              color: accent,
              border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: accent,
                animation: isOpen ? "pulse 1.6s ease-in-out infinite" : undefined,
              }}
            />
            {isOpen ? "Em expediente" : "Fora do expediente"}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
            }}
          >
            {isOpen
              ? "Cronômetro do expediente"
              : "Pronto para iniciar o expediente?"}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: "var(--muted)",
            }}
          >
            {isOpen
              ? `Iniciado às ${formatTime(openEntry!.clock_in)} • ${formatDateTime(openEntry!.clock_in)}`
              : "Você pode adicionar uma observação antes de bater o ponto."}
          </p>

          {isOpen && (
            <div
              style={{
                marginTop: 18,
                fontVariantNumeric: "tabular-nums",
                fontSize: 56,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                color: accent,
                lineHeight: 1,
              }}
            >
              {formatDuration(liveSeconds)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!isOpen ? (
            <>
              <Field label="Observação (opcional)">
                <Input
                  value={notesIn}
                  onChange={(e) => setNotesIn(e.target.value)}
                  placeholder="Ex.: Home office"
                />
              </Field>
              <Button
                onClick={onClockIn}
                loading={working}
                leftIcon={<Play size={16} />}
                size="lg"
                style={{
                  background: accent,
                  borderColor: accent,
                }}
              >
                Iniciar expediente
              </Button>
            </>
          ) : (
            <>
              <Field label="Observação ao encerrar (opcional)">
                <Input
                  value={notesOut}
                  onChange={(e) => setNotesOut(e.target.value)}
                  placeholder="Ex.: Saí mais cedo, dia ok"
                />
              </Field>
              <Button
                onClick={onClockOut}
                loading={working}
                leftIcon={<Square size={14} />}
                size="lg"
                variant="danger"
              >
                Encerrar expediente
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Equipe (admin) ───────────────────────────────────────────────────

type SimpleUser = { id: string; name: string; email: string };

function TeamTab() {
  const [entries, setEntries] = useState<TimeEntryWithUser[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [userFilter, setUserFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    setLoading(true);
    const [list, { data: userList }] = await Promise.all([
      listAllEntries({
        from: startOfMonthISO(),
        to: endOfDayISO(),
        userId: userFilter || undefined,
        limit: 500,
      }),
      supabase
        .from("users")
        .select("id, name, email")
        .eq("is_active", true)
        .order("name"),
    ]);
    setEntries(list);
    setUsers((userList as SimpleUser[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [userFilter]);

  // Atualiza relógio se houver alguém com expediente aberto.
  const hasOpen = entries.some((e) => !e.clock_out);
  useEffect(() => {
    if (!hasOpen) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [hasOpen]);

  // Agrupa por usuário.
  const byUser = useMemo(() => {
    const m = new Map<
      string,
      { user: SimpleUser | null; entries: TimeEntryWithUser[] }
    >();
    for (const e of entries) {
      const id = e.user_id;
      if (!m.has(id)) {
        m.set(id, { user: (e.user as SimpleUser) || null, entries: [] });
      }
      m.get(id)!.entries.push(e);
    }
    return Array.from(m.values()).sort((a, b) => {
      const an = a.user?.name || "";
      const bn = b.user?.name || "";
      return an.localeCompare(bn);
    });
  }, [entries]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="flex items-center gap-2"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <Filter size={13} />
            Filtros
          </div>
          <div style={{ minWidth: 220 }}>
            <Select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">Todos os usuários</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <Badge variant="neutral">
            {MONTH_NAMES[new Date().getMonth()]} de {new Date().getFullYear()}
          </Badge>
        </div>
      </Card>

      {loading ? (
        <Skeleton style={{ height: 200 }} />
      ) : byUser.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={20} />}
          title="Nenhuma batida no período"
          description="Quando alguém bater o ponto, aparece aqui."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {byUser.map(({ user, entries: ues }) => {
            const total = sumDurationSeconds(ues, new Date(now));
            const open = ues.find((e) => !e.clock_out) || null;
            const name = user?.name || "Usuário";
            const days = groupByLocalDay(ues).size;
            return (
              <Card key={user?.id || name}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={name} size="md" />
                    <div className="min-w-0">
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {name}
                      </div>
                      <div className="text-xs text-muted">
                        {user?.email || ""}
                      </div>
                    </div>
                    {open && (
                      <Badge variant="success" dot>
                        Em expediente
                      </Badge>
                    )}
                  </div>
                  <div
                    className="flex items-center gap-3 flex-wrap"
                    style={{ fontSize: 13 }}
                  >
                    <div>
                      <span className="text-muted">Total mês: </span>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatDurationCompact(total)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-muted">Dias trabalhados: </span>
                      <strong>{days}</strong>
                    </div>
                    <div>
                      <span className="text-muted">Batidas: </span>
                      <strong>{ues.length}</strong>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Espelho mensal (admin) ───────────────────────────────────────────

function MonthlyReportTab() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [entries, setEntries] = useState<TimeEntryWithUser[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [userFilter, setUserFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const range = monthRange(year, month);
    const [list, { data: userList }] = await Promise.all([
      listAllEntries({
        from: range.from,
        to: range.to,
        userId: userFilter || undefined,
        limit: 2000,
      }),
      supabase
        .from("users")
        .select("id, name, email")
        .eq("is_active", true)
        .order("name"),
    ]);
    setEntries(list);
    setUsers((userList as SimpleUser[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [year, month, userFilter]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  function exportCSV() {
    const rows = [
      [
        "Usuário",
        "Email",
        "Data",
        "Entrada",
        "Saída",
        "Duração (h)",
        "Observação",
      ],
    ];
    for (const e of entries) {
      const inDate = new Date(e.clock_in);
      const out = e.clock_out ? new Date(e.clock_out) : null;
      const sec = entryDurationSeconds(e, new Date());
      const hours = (sec / 3600).toFixed(2);
      rows.push([
        e.user?.name || "—",
        e.user?.email || "",
        inDate.toLocaleDateString("pt-BR"),
        inDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        out
          ? out.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "(em aberto)",
        hours,
        (e.notes || "").replace(/[\r\n]+/g, " "),
      ]);
    }
    const csv = rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(";")
      )
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ponto-${year}-${String(month + 1).padStart(2, "0")}${
      userFilter ? "-filtrado" : ""
    }.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Agrupa por (user, day) para o espelho.
  type Row = {
    user: SimpleUser | null;
    userId: string;
    days: Map<string, TimeEntryWithUser[]>;
    totalSec: number;
  };

  const rows = useMemo<Row[]>(() => {
    const m = new Map<string, Row>();
    for (const e of entries) {
      const u = (e.user as SimpleUser) || null;
      const id = e.user_id;
      if (!m.has(id)) {
        m.set(id, { user: u, userId: id, days: new Map(), totalSec: 0 });
      }
      const row = m.get(id)!;
      const d = new Date(e.clock_in);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!row.days.has(key)) row.days.set(key, []);
      row.days.get(key)!.push(e);
      row.totalSec += entryDurationSeconds(e);
    }
    return Array.from(m.values()).sort((a, b) =>
      (a.user?.name || "").localeCompare(b.user?.name || "")
    );
  }, [entries]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => shiftMonth(-1)}
              title="Mês anterior"
            >
              <ChevronLeft size={14} />
            </Button>
            <div
              style={{
                minWidth: 180,
                textAlign: "center",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              {MONTH_NAMES[month]} {year}
            </div>
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => shiftMonth(1)}
              title="Próximo mês"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ minWidth: 220 }}>
              <Select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              >
                <option value="">Todos os usuários</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              leftIcon={<Download size={14} />}
              onClick={exportCSV}
              disabled={entries.length === 0}
            >
              Exportar CSV
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Skeleton style={{ height: 240 }} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={20} />}
          title="Sem registros neste mês"
          description="Selecione outro mês ou cadastre batidas pra ver o espelho."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Card key={row.userId} padded={false}>
              <div
                className="flex items-center justify-between flex-wrap gap-3"
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={row.user?.name || "U"} size="md" />
                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {row.user?.name || "Usuário"}
                    </div>
                    <div className="text-xs text-muted">
                      {row.user?.email || ""}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  Total: {formatDurationCompact(row.totalSec)}
                  <span
                    className="text-muted"
                    style={{ marginLeft: 8, fontWeight: 500, fontSize: 12 }}
                  >
                    ({row.days.size} dia{row.days.size === 1 ? "" : "s"})
                  </span>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Entrada</th>
                      <th>Saída</th>
                      <th>Duração</th>
                      <th>Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(row.days.entries())
                      .sort(([a], [b]) => (a < b ? -1 : 1))
                      .flatMap(([day, ues]) =>
                        ues
                          .sort(
                            (a, b) =>
                              new Date(a.clock_in).getTime() -
                              new Date(b.clock_in).getTime()
                          )
                          .map((e, idx) => (
                            <tr key={e.id}>
                              <td className="text-sm">
                                {idx === 0 ? formatDayLabel(day) : ""}
                              </td>
                              <td>{formatTime(e.clock_in)}</td>
                              <td>
                                {e.clock_out ? (
                                  formatTime(e.clock_out)
                                ) : (
                                  <Badge variant="success" dot>
                                    Aberto
                                  </Badge>
                                )}
                              </td>
                              <td
                                style={{
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {formatDuration(entryDurationSeconds(e))}
                              </td>
                              <td className="text-sm text-muted">
                                {e.notes || "—"}
                              </td>
                            </tr>
                          ))
                      )}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
