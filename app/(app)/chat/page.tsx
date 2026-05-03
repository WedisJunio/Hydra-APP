"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Plus,
  Hash,
  Activity,
  Search,
  MessageCircle,
  ChevronLeft,
  Radio,
  FileDown,
  Bell,
  BellOff,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage } from "@/lib/supabase/errors";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { canCreateChatGroup } from "@/lib/permissions";
import { getTodayLocalISO } from "@/lib/utils";
import { downloadChatTranscriptPdf } from "@/lib/chat-export-pdf";

type Message = {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  project_id: string | null;
  chat_group_id: string | null;
  users?: {
    name: string;
    email?: string;
    role?: string;
  } | null;
};

type Project = {
  id: string;
  name: string;
};

type ChatGroup = {
  id: string;
  name: string;
  project_id: string | null;
};

type EnrichedMessage = Message & {
  compact: boolean;
  showDateRule: boolean;
  dateLabel: string | null;
};

const CHAT_MUTED_GROUPS_KEY = "hydra-chat-muted-groups";

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateRuleLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const key = localDateKey(iso);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (key === getTodayLocalISO()) return "Hoje";
  if (key === yKey) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState("");

  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [mutedGroupIds, setMutedGroupIds] = useState<string[]>([]);

  const [isNarrow, setIsNarrow] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"list" | "chat">("list");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const senderNameCache = useRef<Record<string, string>>({});

  const canCreateGroup = canCreateChatGroup(currentUserRole);

  async function loadCurrentProfile() {
    const profile = await getCurrentProfile();
    setCurrentProfileId(profile?.id || null);
    setCurrentUserRole(profile?.role || null);
  }

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) {
      showErrorToast("Erro ao carregar projetos", getSupabaseErrorMessage(error));
      return;
    }
    setProjects(data || []);
  }

  async function loadChatGroups() {
    const { data, error } = await supabase
      .from("chat_groups")
      .select("id, name, project_id")
      .order("name", { ascending: true });
    if (error) {
      showErrorToast("Erro ao carregar grupos", getSupabaseErrorMessage(error));
      return;
    }
    const groups = (data as ChatGroup[]) || [];
    setChatGroups(groups);
    setSelectedGroupId((prev) => {
      if (prev && groups.some((g) => g.id === prev)) return prev;
      return groups.length > 0 ? groups[0].id : "";
    });
  }

  async function loadMessages(groupId: string) {
    if (!groupId) {
      setMessages([]);
      return;
    }
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, content, sender_id, created_at, project_id, chat_group_id, users:sender_id (name, email, role)"
      )
      .eq("chat_group_id", groupId)
      .order("created_at", { ascending: true });
    if (error) {
      showErrorToast("Erro ao carregar mensagens", getSupabaseErrorMessage(error));
      return;
    }
    setMessages((data as unknown as Message[]) || []);
  }

  async function handleCreateGroup() {
    if (!canCreateGroup) {
      showErrorToast("Sem permissão", "Você não tem permissão para criar grupos.");
      return;
    }
    const groupName = window.prompt("Nome do novo grupo avulso:");
    if (!groupName || !groupName.trim()) return;

    const profile = await getCurrentProfile();
    if (!profile) {
      showErrorToast("Sessão inválida", "Entre novamente para criar grupos.");
      return;
    }

    const { data: group, error } = await supabase
      .from("chat_groups")
      .insert({
        name: groupName.trim(),
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !group) {
      showErrorToast("Erro ao criar grupo", getSupabaseErrorMessage(error));
      return;
    }

    await loadChatGroups();
    setSelectedGroupId(group.id);
    if (isNarrow) setMobilePanel("chat");
    showSuccessToast("Grupo criado", "Grupo avulso criado com sucesso.");
  }

  async function handleSendMessage() {
    const trimmed = content.trim();
    if (!trimmed || !selectedGroupId) return;

    const senderId =
      currentProfileId || (await getCurrentProfile())?.id || null;
    if (!senderId) {
      showErrorToast("Sessão inválida", "Entre novamente para enviar mensagens.");
      return;
    }

    setSending(true);
    const { error } = await supabase.from("messages").insert({
      content: trimmed,
      sender_id: senderId,
      chat_group_id: selectedGroupId,
    });

    if (error) {
      showErrorToast("Erro ao enviar mensagem", getSupabaseErrorMessage(error));
      setSending(false);
      return;
    }

    setContent("");
    setSending(false);
    showSuccessToast("Mensagem enviada", `Canal: ${channelTitle}`);
  }

  const saveMutedGroups = useCallback((next: string[]) => {
    setMutedGroupIds(next);
    window.localStorage.setItem(CHAT_MUTED_GROUPS_KEY, JSON.stringify(next));
  }, []);

  const toggleMuteGroup = useCallback(
    (groupId: string) => {
      const isMuted = mutedGroupIds.includes(groupId);
      const next = isMuted
        ? mutedGroupIds.filter((id) => id !== groupId)
        : [...mutedGroupIds, groupId];
      saveMutedGroups(next);
      showSuccessToast(
        isMuted ? "Conversa reativada" : "Conversa silenciada",
        isMuted
          ? "Você voltará a receber notificações desta conversa."
          : "Novas mensagens deste grupo não gerarão popups."
      );
    },
    [mutedGroupIds, saveMutedGroups]
  );

  const resolveSenderName = useCallback(async (senderId: string) => {
    if (senderNameCache.current[senderId]) return senderNameCache.current[senderId];
    const { data } = await supabase
      .from("users")
      .select("name")
      .eq("id", senderId)
      .limit(1)
      .maybeSingle();
    const name = data?.name || "Alguém";
    senderNameCache.current[senderId] = name;
    return name;
  }, []);

  useEffect(() => {
    loadCurrentProfile();
    loadProjects();
    loadChatGroups();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(CHAT_MUTED_GROUPS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setMutedGroupIds(parsed.filter((v): v is string => typeof v === "string"));
      }
    } catch {
      // ignore malformed local storage payload
    }
  }, []);

  useEffect(() => {
    if (selectedGroupId) loadMessages(selectedGroupId);
  }, [selectedGroupId]);

  useEffect(() => {
    const channel = supabase
      .channel("messages-realtime-premium")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const incoming = payload.new as {
            sender_id?: string;
            chat_group_id?: string;
            content?: string;
          };
          const incomingGroupId = incoming.chat_group_id || null;
          if (!incomingGroupId) return;

          if (selectedGroupId && incomingGroupId === selectedGroupId) {
            await loadMessages(selectedGroupId);
          }

          if (
            incoming.sender_id &&
            incoming.sender_id !== currentProfileId &&
            !mutedGroupIds.includes(incomingGroupId)
          ) {
            await showMessagePopup({
              senderId: incoming.sender_id,
              content: incoming.content || "",
              groupId: incomingGroupId,
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProfileId, mutedGroupIds, selectedGroupId, showMessagePopup]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedGroup = useMemo(
    () => chatGroups.find((group) => group.id === selectedGroupId) || null,
    [chatGroups, selectedGroupId]
  );

  const projectById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects]
  );

  async function showMessagePopup(payload: {
    senderId: string;
    content: string;
    groupId: string;
  }) {
    const group = chatGroups.find((g) => g.id === payload.groupId) || null;
    const groupLabel = group
      ? group.project_id
        ? (projectById[group.project_id] ?? group.name)
        : group.name
      : "Conversa";
    const senderName = await resolveSenderName(payload.senderId);
    const text =
      payload.content.length > 120
        ? `${payload.content.slice(0, 117)}...`
        : payload.content;

    showInfoToast(`Nova mensagem em ${groupLabel}`, `${senderName}: ${text}`);

    if (
      document.hidden &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(`Nova mensagem em ${groupLabel}`, {
        body: `${senderName}: ${text}`,
      });
    }
  }

  const channelTitle = selectedGroup?.project_id
    ? (projectById[selectedGroup.project_id] ?? selectedGroup.name)
    : selectedGroup?.name || "Conversa";
  const selectedGroupMuted = !!selectedGroupId && mutedGroupIds.includes(selectedGroupId);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return chatGroups;
    return chatGroups.filter((g) => {
      const label = g.project_id ? (projectById[g.project_id] ?? g.name) : g.name;
      return label.toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
    });
  }, [chatGroups, groupSearch, projectById]);

  const enrichedMessages = useMemo((): EnrichedMessage[] => {
    return messages.map((m, i) => {
      const prev = messages[i - 1];
      const prevKey = prev ? localDateKey(prev.created_at) : "";
      const key = localDateKey(m.created_at);
      const showDateRule = !prev || prevKey !== key;
      const dateLabel = showDateRule ? formatDateRuleLabel(m.created_at) : null;

      const gapMs = prev
        ? new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()
        : Infinity;
      const compact =
        !!prev &&
        prev.sender_id === m.sender_id &&
        !showDateRule &&
        gapMs < 6 * 60 * 1000;

      return { ...m, compact, showDateRule, dateLabel };
    });
  }, [messages]);

  function selectGroup(id: string) {
    setSelectedGroupId(id);
    if (isNarrow) setMobilePanel("chat");
  }

  async function handleExportChatPdf() {
    if (!selectedGroupId) {
      showErrorToast(
        "Selecione um canal",
        "Escolha um grupo para exportar o histórico."
      );
      return;
    }
    const profile = await getCurrentProfile();
    downloadChatTranscriptPdf({
      channelTitle,
      groupTypeLabel: selectedGroup?.project_id
        ? "Projeto vinculado"
        : "Grupo avulso",
      messages,
      exportedBy: profile?.name || profile?.email || null,
      generatedAt: new Date(),
    });
    showSuccessToast(
      "PDF gerado",
      messages.length === 0
        ? "Download iniciado (canal sem mensagens)."
        : `${messages.length} mensagem(ns) no arquivo.`
    );
  }

  const showList = !isNarrow || mobilePanel === "list";
  const showChat = !isNarrow || mobilePanel === "chat";

  return (
    <div>
      <PageHeader
        title="Chat"
        description="Grupos por projeto e avulsos, mensagens em tempo real."
        className="mb-4"
      />

      <Card padded={false} className="chat-shell-premium">
        <div
          className="chat-grid-premium"
        >
          {/* Sidebar — conversas */}
          <aside
            className="chat-sidebar-premium"
            style={{ display: showList ? "flex" : "none" }}
          >
            <div className="chat-sidebar-head">
              <div className="chat-sidebar-brand">
                <div className="chat-sidebar-icon-wrap">
                  <MessageCircle size={18} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <div className="chat-sidebar-title">Conversas</div>
                  <div className="chat-sidebar-sub">
                    {chatGroups.length} grupo{chatGroups.length === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
              {canCreateGroup && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Plus size={14} />}
                  onClick={handleCreateGroup}
                  title="Novo grupo avulso"
                >
                  Novo
                </Button>
              )}
            </div>

            <div style={{ padding: "0 14px 12px" }}>
              <Field className="mb-0">
                <div style={{ position: "relative" }}>
                  <Search
                    size={15}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--muted)",
                      pointerEvents: "none",
                    }}
                  />
                  <Input
                    placeholder="Buscar grupo..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    style={{ paddingLeft: 34 }}
                  />
                </div>
              </Field>
            </div>

            <div className="chat-group-list">
              {filteredGroups.length === 0 && (
                <p className="text-sm text-muted" style={{ padding: "0 14px" }}>
                  {chatGroups.length === 0
                    ? "Nenhum grupo disponível."
                    : "Nenhum resultado."}
                </p>
              )}
              {filteredGroups.map((group) => {
                const isActive = selectedGroupId === group.id;
                const isProjectGroup = !!group.project_id;
                const isMuted = mutedGroupIds.includes(group.id);
                const label = group.project_id
                  ? (projectById[group.project_id] ?? group.name)
                  : group.name;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => selectGroup(group.id)}
                    className={`chat-group-item ${isActive ? "chat-group-item-active" : ""}`}
                  >
                    <span className="chat-group-hash">
                      <Hash size={15} strokeWidth={2} />
                    </span>
                    <span className="chat-group-label truncate">{label}</span>
                    <Badge variant={isProjectGroup ? "info" : "neutral"}>
                      {isProjectGroup ? "Projeto" : "Avulso"}
                    </Badge>
                    {isMuted && <Badge variant="warning">Silenciado</Badge>}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Main — thread */}
          <main
            className="chat-main-premium"
            style={{ display: showChat ? "flex" : "none" }}
          >
            <header className="chat-thread-header">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {isNarrow && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setMobilePanel("list")}
                    title="Voltar às conversas"
                    className="shrink-0"
                  >
                    <ChevronLeft size={18} />
                  </Button>
                )}
                <div
                  className="chat-thread-channel-icon"
                  style={{
                    background: "color-mix(in srgb, var(--primary) 14%, transparent)",
                    color: "var(--primary)",
                  }}
                >
                  <Hash size={18} />
                </div>
                <div className="min-w-0">
                  <p className="chat-thread-meta m-0">Canal</p>
                  <h2 className="chat-thread-title m-0 truncate">{channelTitle}</h2>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={selectedGroupMuted ? <BellOff size={14} /> : <Bell size={14} />}
                  onClick={() => selectedGroupId && toggleMuteGroup(selectedGroupId)}
                  disabled={!selectedGroupId}
                  title={
                    selectedGroupMuted
                      ? "Reativar notificações deste grupo"
                      : "Silenciar notificações deste grupo"
                  }
                >
                  {selectedGroupMuted ? "Silenciado" : "Silenciar"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<FileDown size={14} />}
                  onClick={handleExportChatPdf}
                  disabled={!selectedGroupId}
                  title="Baixar histórico em PDF (A4, páginas numeradas)"
                >
                  Exportar PDF
                </Button>
                <Badge variant="success" dot className="shrink-0">
                  <Radio size={11} style={{ marginRight: 4 }} />
                  Ao vivo
                </Badge>
              </div>
            </header>

            <div className="chat-thread-body">
              {!selectedGroupId && (
                <div className="chat-thread-empty">
                  <EmptyState
                    icon={<MessageCircle size={22} />}
                    title="Selecione um grupo"
                    description="Escolha uma conversa na lista ao lado."
                  />
                </div>
              )}
              {selectedGroupId && messages.length === 0 && (
                <div className="chat-thread-empty">
                  <EmptyState
                    icon={<Activity size={22} />}
                    title="Nenhuma mensagem ainda"
                    description="Envie a primeira mensagem neste canal."
                  />
                </div>
              )}
              <div className="chat-messages-stack">
                {enrichedMessages.map((message) => {
                  const isMine = message.sender_id === currentProfileId;
                  const showAvatar = !isMine && !message.compact;

                  return (
                    <div key={message.id}>
                      {message.showDateRule && message.dateLabel && (
                        <div className="chat-date-rule">
                          <span>{message.dateLabel}</span>
                        </div>
                      )}
                      <div
                        className={`chat-msg-row ${isMine ? "chat-msg-row-mine" : ""}`}
                      >
                        <div className="chat-msg-avatar-slot">
                          {showAvatar ? (
                            <Avatar name={message.users?.name || "?"} size="sm" />
                          ) : !isMine && message.compact ? (
                            <span style={{ width: 32 }} />
                          ) : null}
                        </div>
                        <div
                          className={`chat-bubble-wrap ${
                            message.compact ? "chat-bubble-wrap-compact" : ""
                          }`}
                        >
                          {!isMine && !message.compact && (
                            <div className="chat-bubble-author">
                              {message.users?.name || "Usuário"}
                            </div>
                          )}
                          <div
                            className={`chat-bubble ${
                              isMine ? "chat-bubble-mine" : "chat-bubble-theirs"
                            }`}
                          >
                            <p className="chat-bubble-text m-0">{message.content}</p>
                            <time className="chat-bubble-time">
                              {new Date(message.created_at).toLocaleTimeString(
                                "pt-BR",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </time>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            <footer className="chat-composer">
              <div className="chat-composer-inner">
                <Textarea
                  placeholder={
                    selectedGroupId
                      ? "Escreva uma mensagem… (Enter para enviar, Shift+Enter para nova linha)"
                      : "Selecione um canal para conversar"
                  }
                  value={content}
                  disabled={!selectedGroupId}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="chat-composer-input"
                  style={{ minHeight: 48, maxHeight: 140 }}
                />
                <Button
                  onClick={handleSendMessage}
                  loading={sending}
                  disabled={!selectedGroupId || !content.trim()}
                  className="chat-composer-send"
                  leftIcon={!sending ? <Send size={16} /> : undefined}
                >
                  Enviar
                </Button>
              </div>
            </footer>
          </main>
        </div>
      </Card>

      <style>{`
        .chat-shell-premium {
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
          height: calc(100vh - 200px);
          min-height: 520px;
          max-height: calc(100vh - 140px);
        }

        .chat-grid-premium {
          display: grid;
          grid-template-columns: minmax(260px, 300px) 1fr;
          height: 100%;
          min-height: 0;
        }

        .chat-sidebar-premium {
          flex-direction: column;
          min-height: 0;
          min-width: 0;
          background: var(--surface-2);
          border-right: 1px solid var(--border);
        }

        .chat-sidebar-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          padding: 16px 14px 12px;
          border-bottom: 1px solid var(--border);
        }

        .chat-sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .chat-sidebar-icon-wrap {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--primary) 12%, transparent);
          color: var(--primary);
          flex-shrink: 0;
        }

        .chat-sidebar-title {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .chat-sidebar-sub {
          font-size: 11px;
          color: var(--muted);
          margin-top: 2px;
        }

        .chat-group-list {
          flex: 1;
          overflow-y: auto;
          padding: 4px 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 0;
        }

        .chat-group-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
          text-align: left;
          font-size: 13px;
          font-weight: 600;
          color: var(--foreground);
          transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
        }

        .chat-group-item:hover {
          background: color-mix(in srgb, var(--primary) 6%, transparent);
          border-color: color-mix(in srgb, var(--border) 80%, transparent);
        }

        .chat-group-item-active {
          background: var(--primary-soft) !important;
          border-color: color-mix(in srgb, var(--primary) 35%, transparent) !important;
          color: var(--primary);
        }

        .chat-group-hash {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--muted) 10%, transparent);
          color: var(--muted);
          flex-shrink: 0;
        }

        .chat-group-item-active .chat-group-hash {
          background: color-mix(in srgb, var(--primary) 18%, transparent);
          color: var(--primary);
        }

        .chat-group-label {
          flex: 1;
          min-width: 0;
        }

        .chat-main-premium {
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          background: var(--surface);
        }

        .chat-thread-header {
          padding: 14px 18px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-shrink: 0;
          background: var(--surface);
        }

        .chat-thread-channel-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .chat-thread-meta {
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .chat-thread-title {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .chat-thread-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          background:
            radial-gradient(800px 280px at 10% 0%, color-mix(in srgb, var(--primary) 6%, transparent), transparent 55%),
            var(--surface-2);
        }

        .chat-thread-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          padding: 24px;
        }

        .chat-messages-stack {
          padding: 20px 18px 28px;
          max-width: 920px;
          margin: 0 auto;
        }

        .chat-date-rule {
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 16px 0 12px;
        }

        .chat-date-rule span {
          font-size: 11px;
          font-weight: 700;
          text-transform: capitalize;
          color: var(--muted);
          padding: 4px 12px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--surface) 88%, var(--border));
          border: 1px solid var(--border);
        }

        .chat-msg-row {
          display: flex;
          justify-content: flex-start;
          gap: 10px;
          margin-bottom: 6px;
        }

        .chat-msg-row-mine {
          flex-direction: row-reverse;
        }

        .chat-msg-avatar-slot {
          flex-shrink: 0;
          display: flex;
          justify-content: center;
          padding-top: 2px;
        }

        .chat-bubble-wrap {
          max-width: min(78%, 560px);
        }

        .chat-bubble-wrap-compact {
          margin-top: -2px;
        }

        .chat-msg-row-mine .chat-bubble-wrap {
          align-items: flex-end;
        }

        .chat-bubble-author {
          font-size: 12px;
          font-weight: 700;
          color: var(--primary);
          margin: 0 4px 4px;
        }

        .chat-bubble {
          border-radius: 16px;
          padding: 10px 14px 8px;
          box-shadow: var(--shadow-xs);
          position: relative;
        }

        .chat-bubble-theirs {
          background: var(--surface);
          border: 1px solid var(--border);
          border-bottom-left-radius: 5px;
        }

        .chat-bubble-mine {
          background: linear-gradient(145deg, var(--primary), color-mix(in srgb, var(--primary) 78%, #1e3a5f));
          color: #fff;
          border-bottom-right-radius: 5px;
          border: none;
        }

        .chat-bubble-text {
          font-size: 14px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .chat-bubble-time {
          display: block;
          text-align: right;
          font-size: 10px;
          opacity: 0.75;
          margin-top: 6px;
          font-variant-numeric: tabular-nums;
        }

        .chat-composer {
          flex-shrink: 0;
          padding: 14px 16px 16px;
          border-top: 1px solid var(--border);
          background: var(--surface);
        }

        .chat-composer-inner {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          max-width: 920px;
          margin: 0 auto;
          padding: 4px;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface-2);
          box-shadow: 0 1px 0 color-mix(in srgb, var(--border) 50%, transparent);
        }

        .chat-composer-input {
          flex: 1;
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          resize: none;
        }

        .chat-composer-send {
          margin: 4px 4px 4px 0;
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .chat-grid-premium {
            grid-template-columns: 1fr;
          }
          .chat-shell-premium {
            height: calc(100vh - 180px);
            min-height: 420px;
          }
          .chat-bubble-wrap {
            max-width: 88%;
          }
        }
      `}</style>
    </div>
  );
}
