"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  MapPin,
  Users as UsersIcon,
  Clock,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Bell,
  Lock,
  Palette,
  Save,
  Sparkles,
  X,
  LayoutGrid,
  CalendarDays,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatsGrid } from "@/components/ui/stat";
import {
  AvailabilityTimeline,
  type TimelineMeeting,
  type TimelineRow,
} from "@/components/calendar/availability-timeline";
import {
  MonthCalendarGrid,
  type DayBucket,
  type MonthDayMeeting,
  type MonthDayProject,
  type MonthDayTask,
} from "@/components/calendar/month-calendar-grid";
import { getTodayLocalISO } from "@/lib/utils";

type Room = {
  id: string;
  name: string;
  location: string | null;
  capacity: number | null;
};

type User = {
  id: string;
  name: string;
  email: string;
};

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  room_id: string | null;
  created_by: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  reminder_minutes: number | null;
  event_color: string | null;
  is_private: boolean;
  meeting_rooms?: { name: string; location: string | null } | null;
  users?: { name: string; email: string } | null;
  meeting_participants?: {
    users: { id: string; name: string; email: string } | null;
  }[];
};

const EVENT_COLORS: { value: string; label: string }[] = [
  { value: "#22c55e", label: "Verde" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#f97316", label: "Laranja" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#a855f7", label: "Roxo" },
  { value: "#eab308", label: "Amarelo" },
  { value: "#64748b", label: "Cinza" },
];

const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Sem lembrete" },
  { value: 0, label: "Na hora" },
  { value: 5, label: "5 minutos antes" },
  { value: 10, label: "10 minutos antes" },
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 1440, label: "1 dia antes" },
];

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hasScheduleConflict(
  meetings: Meeting[],
  roomId: string,
  startTime: string,
  endTime: string
) {
  const newStart = new Date(startTime).getTime();
  const newEnd = new Date(endTime).getTime();
  return meetings.some((meeting) => {
    if (meeting.room_id !== roomId) return false;
    const existingStart = new Date(meeting.start_time).getTime();
    const existingEnd = new Date(meeting.end_time).getTime();
    return newStart < existingEnd && newEnd > existingStart;
  });
}

type CalendarCursor = { y: number; m0: number };

function meetingLocalDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function dateOnly(raw: string) {
  return raw.slice(0, 10);
}

function emptyDayBucket(): DayBucket {
  return { meetings: [], tasks: [], projects: [] };
}

function buildItemsByDay(
  meetings: MonthDayMeeting[],
  tasks: MonthDayTask[],
  projects: MonthDayProject[]
): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  function getBucket(key: string): DayBucket {
    let b = map.get(key);
    if (!b) {
      b = emptyDayBucket();
      map.set(key, b);
    }
    return b;
  }
  for (const m of meetings) {
    getBucket(meetingLocalDateKey(m.start_time)).meetings.push(m);
  }
  for (const t of tasks) {
    if (!t.planned_due_date) continue;
    getBucket(dateOnly(t.planned_due_date)).tasks.push(t);
  }
  for (const p of projects) {
    if (!p.planned_end_date) continue;
    getBucket(dateOnly(p.planned_end_date)).projects.push(p);
  }
  return map;
}

export default function CalendarPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()));
  const [selectedRoomFilter, setSelectedRoomFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [roomId, setRoomId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Campos avançados
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(15);
  const [eventColor, setEventColor] = useState<string>(EVENT_COLORS[1].value);
  const [isPrivate, setIsPrivate] = useState(false);

  const [viewMode, setViewMode] = useState<"month" | "day">("month");
  const [calendarCursor, setCalendarCursor] = useState<CalendarCursor>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m0: d.getMonth() };
  });
  const [monthMeetings, setMonthMeetings] = useState<MonthDayMeeting[]>([]);
  const [monthTasks, setMonthTasks] = useState<MonthDayTask[]>([]);
  const [monthProjects, setMonthProjects] = useState<MonthDayProject[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);

  async function loadRooms() {
    const { data } = await supabase
      .from("meeting_rooms")
      .select("id, name, location, capacity")
      .eq("is_active", true)
      .order("name", { ascending: true });
    setRooms(data || []);
    if (!roomId && data && data.length > 0) setRoomId(data[0].id);
  }

  async function loadUsers() {
    const { data } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("is_active", true)
      .order("name", { ascending: true });
    setUsers(data || []);
  }

  const loadMeetings = useCallback(async () => {
    const startOfDay = `${selectedDate}T00:00:00`;
    const endOfDay = `${selectedDate}T23:59:59`;

    const { data } = await supabase
      .from("meetings")
      .select(
        `id, title, description, room_id, created_by, start_time, end_time, created_at,
         reminder_minutes, event_color, is_private,
         meeting_rooms:room_id (name, location),
         users:created_by (name, email),
         meeting_participants (users:user_id (id, name, email))`
      )
      .gte("start_time", startOfDay)
      .lte("start_time", endOfDay)
      .order("start_time", { ascending: true });

    setMeetings((data as unknown as Meeting[]) || []);
  }, [selectedDate]);

  const loadMonthAgenda = useCallback(async () => {
    setMonthLoading(true);
    try {
      const { y, m0 } = calendarCursor;
      const start = `${y}-${String(m0 + 1).padStart(2, "0")}-01`;
      const lastDayN = new Date(y, m0 + 1, 0).getDate();
      const end = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(lastDayN).padStart(2, "0")}`;
      const startDT = `${start}T00:00:00`;
      const endDT = `${end}T23:59:59`;

      const [meetRes, taskRes, projRes] = await Promise.all([
        supabase
          .from("meetings")
          .select("id, title, start_time, event_color")
          .gte("start_time", startDT)
          .lte("start_time", endDT)
          .order("start_time", { ascending: true }),
        supabase
          .from("tasks")
          .select("id, title, planned_due_date, status")
          .not("planned_due_date", "is", null)
          .gte("planned_due_date", start)
          .lte("planned_due_date", end)
          .neq("status", "completed"),
        supabase
          .from("projects")
          .select("id, name, planned_end_date")
          .not("planned_end_date", "is", null)
          .gte("planned_end_date", start)
          .lte("planned_end_date", end),
      ]);

      setMonthMeetings((meetRes.data as MonthDayMeeting[]) || []);
      setMonthTasks((taskRes.data as MonthDayTask[]) || []);
      setMonthProjects((projRes.data as MonthDayProject[]) || []);
    } finally {
      setMonthLoading(false);
    }
  }, [calendarCursor]);

  async function handleCreateMeeting() {
    if (!title.trim() || !roomId || !selectedDate || !startTime || !endTime) {
      showErrorToast("Campos obrigatórios", "Preencha título, sala, data, início e fim.");
      return;
    }
    const startDateTime = `${selectedDate}T${startTime}:00`;
    const endDateTime = `${selectedDate}T${endTime}:00`;

    if (new Date(endDateTime).getTime() <= new Date(startDateTime).getTime()) {
      showErrorToast("Horário inválido", "O horário final precisa ser maior que o horário inicial.");
      return;
    }
    if (hasScheduleConflict(meetings, roomId, startDateTime, endDateTime)) {
      showErrorToast("Conflito de agenda", "Essa sala já está ocupada nesse horário.");
      return;
    }

    const profile = await getCurrentProfile();
    if (!profile) {
      showErrorToast("Sessão inválida", "Faça login novamente para agendar reuniões.");
      return;
    }

    setCreating(true);

    const { data: meeting, error } = await supabase
      .from("meetings")
      .insert({
        title,
        description,
        room_id: roomId,
        created_by: profile.id,
        start_time: startDateTime,
        end_time: endDateTime,
        reminder_minutes: reminderMinutes,
        event_color: eventColor,
        is_private: isPrivate,
      })
      .select("id")
      .single();

    if (error || !meeting) {
      showErrorToast("Erro ao criar reunião", "Não foi possível salvar o agendamento.");
      setCreating(false);
      return;
    }

    const participants = Array.from(new Set([...selectedParticipants, profile.id]));
    if (participants.length > 0) {
      await supabase.from("meeting_participants").insert(
        participants.map((userId) => ({
          meeting_id: meeting.id,
          user_id: userId,
          status: "invited",
        }))
      );
    }

    setTitle("");
    setDescription("");
    setStartTime("09:00");
    setEndTime("10:00");
    setSelectedParticipants([]);
    setReminderMinutes(15);
    setEventColor(EVENT_COLORS[1].value);
    setIsPrivate(false);
    setShowForm(false);

    await loadMeetings();
    if (viewMode === "month") await loadMonthAgenda();

    showSuccessToast(
      "Reunião agendada",
      `${title.trim()} • ${new Date(startDateTime).toLocaleDateString("pt-BR")} às ${startTime}`
    );
    setCreating(false);
  }

  async function handleDeleteMeeting(meetingId: string) {
    if (!window.confirm("Excluir esta reunião?")) return;
    const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
    if (error) {
      showErrorToast("Sem permissão", "Você não tem permissão para excluir esta reunião.");
      return;
    }
    await loadMeetings();
    if (viewMode === "month") await loadMonthAgenda();
  }

  function handleParticipantToggle(userId: string, checked: boolean) {
    if (checked) setSelectedParticipants((prev) => [...prev, userId]);
    else setSelectedParticipants((prev) => prev.filter((id) => id !== userId));
  }

  useEffect(() => {
    getCurrentProfile().then((profile) => {
      setCurrentProfileId(profile?.id || null);
    });
    loadRooms();
    loadUsers();
  }, []);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    if (viewMode !== "month") return;
    void loadMonthAgenda();
  }, [viewMode, loadMonthAgenda]);

  useEffect(() => {
    const channel = supabase
      .channel("meetings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings" },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as {
              title?: string;
              start_time?: string;
              created_by?: string | null;
            };
            if (row.created_by && row.created_by !== currentProfileId) {
              const when = row.start_time
                ? new Date(row.start_time).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "horário indefinido";
              const text = `${row.title || "Reunião"} • ${when}`;
              showInfoToast("Nova reunião marcada", text);
              if (
                document.hidden &&
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                new Notification("Nova reunião marcada", { body: text });
              }
            }
          }
          await loadMeetings();
          if (viewMode === "month") await loadMonthAgenda();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProfileId, loadMeetings, loadMonthAgenda, viewMode]);

  const filteredMeetings = useMemo(() => {
    if (!selectedRoomFilter) return meetings;
    return meetings.filter((m) => m.room_id === selectedRoomFilter);
  }, [meetings, selectedRoomFilter]);

  const meetingsByRoom = useMemo(() => {
    return rooms.map((room) => {
      const roomMeetings = meetings.filter((m) => m.room_id === room.id);
      return { room, meetings: roomMeetings, occupied: roomMeetings.length > 0 };
    });
  }, [rooms, meetings]);

  const occupiedRooms = meetingsByRoom.filter((item) => item.occupied).length;

  const friendlyDate = useMemo(
    () =>
      new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    [selectedDate]
  );

  const itemsByDay = useMemo(
    () => buildItemsByDay(monthMeetings, monthTasks, monthProjects),
    [monthMeetings, monthTasks, monthProjects]
  );

  const monthSummary = useMemo(
    () => ({
      meetings: monthMeetings.length,
      tasks: monthTasks.length,
      projects: monthProjects.length,
    }),
    [monthMeetings, monthTasks, monthProjects]
  );

  const todayISO = getTodayLocalISO();

  const selectedDayBucket = useMemo(
    () => itemsByDay.get(selectedDate) ?? emptyDayBucket(),
    [itemsByDay, selectedDate]
  );

  function openMonthView() {
    const d = new Date(selectedDate + "T12:00:00");
    setCalendarCursor({ y: d.getFullYear(), m0: d.getMonth() });
    setViewMode("month");
  }

  function prevCalendarMonth() {
    setCalendarCursor(({ y, m0 }) =>
      m0 === 0 ? { y: y - 1, m0: 11 } : { y, m0: m0 - 1 }
    );
  }

  function nextCalendarMonth() {
    setCalendarCursor(({ y, m0 }) =>
      m0 === 11 ? { y: y + 1, m0: 0 } : { y, m0: m0 + 1 }
    );
  }

  return (
    <div>
      <PageHeader
        title="Calendário"
        description={
          viewMode === "month"
            ? "Mês completo: prazos de tarefas, entregas de projetos e reuniões."
            : "Reuniões, salas, horários e participantes em tempo real."
        }
        actions={
          <Button leftIcon={<Plus size={16} />} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Fechar" : "Nova reunião"}
          </Button>
        }
      />

      <div
        className="flex items-center gap-2 mb-6 flex-wrap"
        style={{ alignItems: "center" }}
      >
        <Button
          type="button"
          variant={viewMode === "month" ? "primary" : "secondary"}
          leftIcon={<LayoutGrid size={16} />}
          onClick={openMonthView}
        >
          Visão do mês
        </Button>
        <Button
          type="button"
          variant={viewMode === "day" ? "primary" : "secondary"}
          leftIcon={<CalendarDays size={16} />}
          onClick={() => setViewMode("day")}
        >
          Dia e reuniões
        </Button>
      </div>

      {showForm && (
        <MeetingFormCard
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          roomId={roomId}
          setRoomId={setRoomId}
          rooms={rooms}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          startTime={startTime}
          setStartTime={setStartTime}
          endTime={endTime}
          setEndTime={setEndTime}
          users={users}
          selectedParticipants={selectedParticipants}
          onToggleParticipant={handleParticipantToggle}
          meetings={meetings}
          reminderMinutes={reminderMinutes}
          setReminderMinutes={setReminderMinutes}
          eventColor={eventColor}
          setEventColor={setEventColor}
          isPrivate={isPrivate}
          setIsPrivate={setIsPrivate}
          creating={creating}
          onSave={handleCreateMeeting}
          onCancel={() => setShowForm(false)}
        />
      )}

      {viewMode === "month" && (
        <>
          <StatsGrid>
            <Stat
              label="Reuniões no mês"
              value={monthSummary.meetings}
              icon={<CalendarIcon size={16} />}
            />
            <Stat
              label="Tarefas com prazo"
              value={monthSummary.tasks}
              icon={<CheckCircle2 size={16} />}
            />
            <Stat
              label="Entregas de projeto"
              value={monthSummary.projects}
              icon={<AlertCircle size={16} />}
            />
          </StatsGrid>

          <Card className="mt-6">
            <MonthCalendarGrid
              year={calendarCursor.y}
              monthIndex={calendarCursor.m0}
              itemsByDay={itemsByDay}
              selectedDate={selectedDate}
              todayISO={todayISO}
              loading={monthLoading}
              onSelectDay={(iso) => setSelectedDate(iso)}
              onPrevMonth={prevCalendarMonth}
              onNextMonth={nextCalendarMonth}
            />
          </Card>

          <Card className="mt-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <div className="card-title">Dia selecionado</div>
                <p
                  className="text-sm text-muted mt-1 capitalize"
                  style={{ textTransform: "capitalize" }}
                >
                  {friendlyDate}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setViewMode("day")}
                leftIcon={<CalendarDays size={14} />}
              >
                Ver agenda desse dia
              </Button>
            </div>

            {selectedDayBucket.meetings.length === 0 &&
            selectedDayBucket.tasks.length === 0 &&
            selectedDayBucket.projects.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon size={22} />}
                title="Nada marcado neste dia"
                description="Escolha outro dia no calendário ou agende uma reunião na aba “Dia e reuniões”."
              />
            ) : (
              <div className="flex flex-col gap-5">
                {selectedDayBucket.tasks.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                      Prazos de tarefas
                    </div>
                    <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                      {selectedDayBucket.tasks.map((t) => (
                        <li
                          key={t.id}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border)",
                            borderLeft: "4px solid #3b82f6",
                            background: "var(--surface-2)",
                          }}
                        >
                          <span className="text-sm font-medium">{t.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedDayBucket.projects.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                      Entrega de projeto
                    </div>
                    <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                      {selectedDayBucket.projects.map((p) => (
                        <li
                          key={p.id}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border)",
                            borderLeft: "4px solid #a855f7",
                            background: "var(--surface-2)",
                          }}
                        >
                          <span className="text-sm font-medium">{p.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedDayBucket.meetings.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
                      Reuniões
                    </div>
                    <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                      {selectedDayBucket.meetings.map((m) => (
                        <li
                          key={m.id}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border)",
                            borderLeft: `4px solid ${m.event_color || "#22c55e"}`,
                            background: "var(--surface-2)",
                          }}
                        >
                          <span className="text-sm font-medium">{m.title}</span>
                          <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                            {formatTime(m.start_time)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {viewMode === "day" && (
        <>
          <div
            className="flex items-center gap-3 mb-6 flex-wrap"
            style={{ alignItems: "center" }}
          >
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: "auto", minWidth: 200 }}
            />
            <span className="text-sm text-muted" style={{ textTransform: "capitalize" }}>
              {friendlyDate}
            </span>
            <div style={{ marginLeft: "auto" }} className="flex items-center gap-2">
              <Select
                value={selectedRoomFilter}
                onChange={(e) => setSelectedRoomFilter(e.target.value)}
                style={{ width: "auto", minWidth: 200 }}
              >
                <option value="">Todas as salas</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <StatsGrid>
            <Stat
              label="Reuniões hoje"
              value={meetings.length}
              icon={<CalendarIcon size={16} />}
            />
        <Stat
          label="Salas ocupadas"
          value={`${occupiedRooms} / ${rooms.length}`}
          icon={<MapPin size={16} />}
        />
        <Stat
          label="Salas livres"
          value={Math.max(rooms.length - occupiedRooms, 0)}
          icon={<CheckCircle2 size={16} />}
        />
      </StatsGrid>

      <div className="grid-2 mt-6" style={{ alignItems: "start" }}>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="card-title">Agenda do dia</div>
              <p className="text-sm text-muted mt-1">
                {filteredMeetings.length} reunião
                {filteredMeetings.length === 1 ? "" : "s"} agendada
                {filteredMeetings.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {filteredMeetings.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon size={22} />}
              title="Nenhuma reunião"
              description="Sem agendamentos pra esta data e filtro. Que tal agendar uma?"
              action={
                <Button leftIcon={<Plus size={16} />} onClick={() => setShowForm(true)}>
                  Nova reunião
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {filteredMeetings.map((meeting) => {
                const participantNames =
                  meeting.meeting_participants
                    ?.map((p) => p.users?.name)
                    .filter(Boolean) || [];

                const stripe = meeting.event_color || "var(--primary)";
                return (
                  <div
                    key={meeting.id}
                    style={{
                      padding: 16,
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                      background: "var(--surface-2)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      borderLeft: `4px solid ${stripe}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="primary" dot>
                            {formatTime(meeting.start_time)} —{" "}
                            {formatTime(meeting.end_time)}
                          </Badge>
                          <Badge variant="neutral">
                            <MapPin size={11} />
                            {meeting.meeting_rooms?.name || "Sem sala"}
                          </Badge>
                          {meeting.is_private && (
                            <Badge variant="warning" dot>
                              <Lock size={10} /> Privada
                            </Badge>
                          )}
                          {meeting.reminder_minutes !== null &&
                            meeting.reminder_minutes !== undefined && (
                              <Badge variant="info">
                                <Bell size={10} />
                                {meeting.reminder_minutes === 0
                                  ? "Na hora"
                                  : meeting.reminder_minutes >= 60
                                  ? `${meeting.reminder_minutes / 60}h antes`
                                  : `${meeting.reminder_minutes}min antes`}
                              </Badge>
                            )}
                        </div>
                        <h3 className="font-semibold text-md">{meeting.title}</h3>
                        {meeting.description && (
                          <p className="text-sm text-muted mt-1">{meeting.description}</p>
                        )}
                      </div>
                      <Button
                        size="icon-sm"
                        variant="danger-ghost"
                        onClick={() => handleDeleteMeeting(meeting.id)}
                        title="Excluir reunião"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>

                    <div
                      className="flex items-center justify-between gap-3 flex-wrap pt-3"
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <UsersIcon size={13} />
                        <span>
                          Agendado por{" "}
                          <strong className="text-foreground">
                            {meeting.users?.name || "Usuário"}
                          </strong>
                        </span>
                      </div>
                      {participantNames.length > 0 && (
                        <div className="flex items-center gap-1">
                          {participantNames.slice(0, 4).map((name, i) => (
                            <Avatar key={i} name={name as string} size="sm" />
                          ))}
                          {participantNames.length > 4 && (
                            <Badge variant="neutral">
                              +{participantNames.length - 4}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="card-title">Ocupação das salas</div>
              <p className="text-sm text-muted mt-1">Status das salas no dia</p>
            </div>
          </div>

          {meetingsByRoom.length === 0 ? (
            <EmptyState
              title="Sem salas cadastradas"
              description="Cadastre salas no banco pra começar a agendar reuniões."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {meetingsByRoom.map((item) => (
                <div
                  key={item.room.id}
                  style={{
                    padding: 14,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    background: item.occupied ? "var(--warning-soft)" : "var(--success-soft)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <strong className="text-sm">{item.room.name}</strong>
                      <div className="text-xs text-muted flex items-center gap-2 mt-1">
                        {item.room.location && (
                          <>
                            <MapPin size={11} />
                            <span>{item.room.location}</span>
                          </>
                        )}
                        {item.room.capacity && (
                          <>
                            <UsersIcon size={11} />
                            <span>{item.room.capacity} pessoas</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant={item.occupied ? "warning" : "success"} dot>
                      {item.occupied ? "Ocupada" : "Livre"}
                    </Badge>
                  </div>
                  {item.meetings.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1">
                      {item.meetings.map((m) => (
                        <div
                          key={m.id}
                          className="text-xs flex items-center gap-2"
                          style={{ color: "var(--warning-fg)" }}
                        >
                          <Clock size={11} />
                          {formatTime(m.start_time)} — {formatTime(m.end_time)} • {m.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
        </>
      )}
    </div>
  );
}

function MeetingFormCard({
  title,
  setTitle,
  description,
  setDescription,
  roomId,
  setRoomId,
  rooms,
  selectedDate,
  setSelectedDate,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  users,
  selectedParticipants,
  onToggleParticipant,
  meetings,
  reminderMinutes,
  setReminderMinutes,
  eventColor,
  setEventColor,
  isPrivate,
  setIsPrivate,
  creating,
  onSave,
  onCancel,
}: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  roomId: string;
  setRoomId: (v: string) => void;
  rooms: Room[];
  selectedDate: string;
  setSelectedDate: (v: string) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  endTime: string;
  setEndTime: (v: string) => void;
  users: User[];
  selectedParticipants: string[];
  onToggleParticipant: (userId: string, checked: boolean) => void;
  meetings: Meeting[];
  reminderMinutes: number | null;
  setReminderMinutes: (v: number | null) => void;
  eventColor: string;
  setEventColor: (v: string) => void;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  creating: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Linhas da timeline: participantes selecionados + sala (na ordem)
  const selectedUsers = users.filter((u) => selectedParticipants.includes(u.id));
  const room = rooms.find((r) => r.id === roomId) || null;

  const timelineRows: TimelineRow[] = [
    ...selectedUsers.map<TimelineRow>((u) => ({
      kind: "user",
      id: u.id,
      name: u.name,
      subtitle: u.email,
    })),
    ...(room
      ? ([
          {
            kind: "room",
            id: room.id,
            name: room.name,
            subtitle: room.location || undefined,
          },
        ] as TimelineRow[])
      : []),
  ];

  const timelineMeetings: TimelineMeeting[] = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    start_time: m.start_time,
    end_time: m.end_time,
    room_id: m.room_id,
    participantIds:
      m.meeting_participants
        ?.map((p) => p.users?.id)
        .filter((x): x is string => !!x) || [],
  }));

  return (
    <Card
      className="mb-4"
      padded={false}
      style={{ overflow: "hidden", borderRadius: 18 }}
    >
      {/* Header com gradiente */}
      <div
        style={{
          padding: "18px 22px",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--primary) 16%, transparent), color-mix(in srgb, var(--primary) 4%, transparent))",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--primary-soft)",
            color: "var(--primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Sparkles size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            Agendar reunião
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Escolha sala, participantes e veja a disponibilidade ao vivo.
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onCancel} title="Fechar">
          <X size={14} />
        </Button>
      </div>

      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Título */}
        <Field label="Título da reunião">
          <Input
            placeholder="Ex.: Revisão de cronograma — Edifício Aurora"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        {/* Sala + Data + Início + Fim */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 2fr) repeat(3, minmax(120px, 1fr))",
            gap: 10,
          }}
        >
          <Field label="Sala">
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Selecione a sala</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.capacity ? ` — ${r.capacity} pessoas` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </Field>
          <Field label="Início">
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="Fim">
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>

        {/* Participantes */}
        <Field
          label={
            <span className="flex items-center gap-2">
              <UsersIcon size={13} />
              Participantes
              {selectedParticipants.length > 0 && (
                <Badge variant="primary">{selectedParticipants.length}</Badge>
              )}
            </span>
          }
        >
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--surface-2)",
              padding: 8,
              maxHeight: 180,
              overflowY: "auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 4,
            }}
          >
            {users.length === 0 && (
              <span className="text-sm text-muted">Nenhum usuário ativo.</span>
            )}
            {users.map((user) => {
              const checked = selectedParticipants.includes(user.id);
              return (
                <label
                  key={user.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 6,
                    borderRadius: 8,
                    background: checked ? "var(--primary-soft)" : "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    minWidth: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      onToggleParticipant(user.id, e.target.checked)
                    }
                  />
                  <Avatar name={user.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{user.name}</div>
                    <div className="text-xs text-muted truncate">
                      {user.email}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </Field>

        {/* TIMELINE de disponibilidade */}
        {timelineRows.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div
              className="flex items-center gap-2"
              style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}
            >
              <Clock size={13} />
              <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Disponibilidade no dia
              </span>
            </div>
            <AvailabilityTimeline
              rows={timelineRows}
              meetings={timelineMeetings}
              date={selectedDate}
              selection={{ start: startTime, end: endTime }}
              onClickHour={(h) => {
                const hh = String(h).padStart(2, "0");
                setStartTime(`${hh}:00`);
                setEndTime(`${String(h + 1).padStart(2, "0")}:00`);
              }}
            />
          </div>
        ) : (
          <div
            style={{
              padding: 12,
              border: "1px dashed var(--border)",
              borderRadius: 12,
              fontSize: 13,
              color: "var(--muted)",
              textAlign: "center",
            }}
          >
            Selecione participantes e/ou sala para ver a disponibilidade.
          </div>
        )}

        <div
          style={{
            padding: 16,
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "var(--surface-2)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
            <Field
              label={
                <span>
                  Descrição
                  <span className="text-muted text-xs" style={{ fontWeight: 400 }}>
                    {" "}
                    — pauta, links, contexto
                  </span>
                </span>
              }
            >
              <Textarea
                placeholder="Tópicos, decisões a tomar, links de documentos..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </Field>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 10,
              }}
            >
              <Field
                label={
                  <span className="flex items-center gap-1">
                    <Bell size={13} /> Lembrete
                  </span>
                }
              >
                <Select
                  value={reminderMinutes === null ? "" : String(reminderMinutes)}
                  onChange={(e) =>
                    setReminderMinutes(
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                >
                  {REMINDER_OPTIONS.map((o) => (
                    <option
                      key={String(o.value)}
                      value={o.value === null ? "" : String(o.value)}
                    >
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label={
                <span className="flex items-center gap-1">
                  <Palette size={13} /> Cor do evento
                </span>
              }
            >
              <div className="flex items-center gap-2 flex-wrap">
                {EVENT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.value}
                    title={c.label}
                    onClick={() => setEventColor(c.value)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: c.value,
                      border:
                        eventColor === c.value
                          ? "3px solid var(--text)"
                          : "1px solid var(--border)",
                      cursor: "pointer",
                      transition: "transform 120ms ease",
                      transform:
                        eventColor === c.value ? "scale(1.08)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </Field>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: isPrivate
                  ? "color-mix(in srgb, var(--warning) 15%, transparent)"
                  : "var(--surface)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <Lock size={14} />
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  Evento privado
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Detalhes ficam visíveis apenas para você e os convidados.
                </div>
              </div>
            </label>
          </div>

        <div
          className="flex items-center gap-2"
          style={{
            paddingTop: 6,
            borderTop: "1px solid var(--border)",
            marginTop: 4,
          }}
        >
          <Button
            onClick={onSave}
            loading={creating}
            leftIcon={<Save size={14} />}
          >
            Agendar reunião
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </Card>
  );
}
