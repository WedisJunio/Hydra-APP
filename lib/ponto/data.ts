import { supabase } from "@/lib/supabase/client";

export type TimeEntry = {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeEntryWithUser = TimeEntry & {
  user?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

const COLS = "id, user_id, clock_in, clock_out, notes, created_at, updated_at";

// ─── Leituras do próprio usuário ────────────────────────────────────────────

export async function getOpenEntry(userId: string): Promise<TimeEntry | null> {
  const { data, error } = await supabase
    .from("time_entries")
    .select(COLS)
    .eq("user_id", userId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getOpenEntry:", error.message);
    return null;
  }
  return (data as TimeEntry) ?? null;
}

export async function listMyEntries(
  userId: string,
  opts: { from?: string; to?: string; limit?: number } = {}
): Promise<TimeEntry[]> {
  let q = supabase
    .from("time_entries")
    .select(COLS)
    .eq("user_id", userId)
    .order("clock_in", { ascending: false });

  if (opts.from) q = q.gte("clock_in", opts.from);
  if (opts.to) q = q.lte("clock_in", opts.to);
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) {
    console.error("listMyEntries:", error.message);
    return [];
  }
  return (data as TimeEntry[]) ?? [];
}

// ─── Escritas (clock in/out) ───────────────────────────────────────────────

export async function clockIn(
  userId: string,
  notes?: string | null
): Promise<{ data: TimeEntry | null; error: string | null }> {
  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      user_id: userId,
      clock_in: new Date().toISOString(),
      clock_out: null,
      notes: notes || null,
    })
    .select(COLS)
    .single();
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as TimeEntry, error: null };
}

export async function clockOut(
  entryId: string,
  notes?: string | null
): Promise<{ data: TimeEntry | null; error: string | null }> {
  const update: Record<string, unknown> = {
    clock_out: new Date().toISOString(),
  };
  if (notes !== undefined) update.notes = notes || null;

  const { data, error } = await supabase
    .from("time_entries")
    .update(update)
    .eq("id", entryId)
    .select(COLS)
    .single();
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as TimeEntry, error: null };
}

export async function updateEntryNotes(
  entryId: string,
  notes: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("time_entries")
    .update({ notes: notes || null })
    .eq("id", entryId);
  return { error: error?.message ?? null };
}

export async function deleteEntry(
  entryId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", entryId);
  return { error: error?.message ?? null };
}

// ─── Visão administrativa (depende da RLS deixar passar) ────────────────────

export async function listAllEntries(opts: {
  from?: string;
  to?: string;
  userId?: string;
  limit?: number;
} = {}): Promise<TimeEntryWithUser[]> {
  let q = supabase
    .from("time_entries")
    .select(`${COLS}, user:user_id (id, name, email)`)
    .order("clock_in", { ascending: false });

  if (opts.from) q = q.gte("clock_in", opts.from);
  if (opts.to) q = q.lte("clock_in", opts.to);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error) {
    console.error("listAllEntries:", error.message);
    return [];
  }
  return (data as unknown as TimeEntryWithUser[]) ?? [];
}

// ─── Helpers de tempo ──────────────────────────────────────────────────────

export function entryDurationSeconds(entry: TimeEntry, now = new Date()): number {
  const start = new Date(entry.clock_in).getTime();
  const end = entry.clock_out ? new Date(entry.clock_out).getTime() : now.getTime();
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function sumDurationSeconds(
  entries: TimeEntry[],
  now = new Date()
): number {
  return entries.reduce((acc, e) => acc + entryDurationSeconds(e, now), 0);
}

export function formatDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const t = Math.abs(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDurationCompact(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (h <= 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

// Início do dia local (00:00) em ISO.
export function startOfDayISO(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Fim do dia local (23:59:59.999) em ISO.
export function endOfDayISO(date = new Date()): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

// Início da semana (segunda-feira) em ISO.
export function startOfWeekISO(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=dom, 1=seg ...
  const diff = day === 0 ? -6 : 1 - day; // segunda como início
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfMonthISO(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  return d.toISOString();
}

export function endOfMonthISO(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return d.toISOString();
}

export function monthRange(year: number, month0: number): { from: string; to: string } {
  const from = new Date(year, month0, 1, 0, 0, 0, 0).toISOString();
  const to = new Date(year, month0 + 1, 0, 23, 59, 59, 999).toISOString();
  return { from, to };
}

// Divide entradas por dia (chave YYYY-MM-DD local).
export function groupByLocalDay(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const m = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const d = new Date(e.clock_in);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(e);
  }
  return m;
}
