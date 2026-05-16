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
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  X,
  Users,
  UserPlus,
  Check,
  ExternalLink,
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
import { formatProjectDisplayName } from "@/lib/project-display";

type Message = {
  id: string;
  content: string;
  attachments?: ChatAttachment[] | null;
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
  municipality?: string | null;
  state?: string | null;
};

type ChatGroup = {
  id: string;
  name: string;
  project_id: string | null;
  created_by?: string | null;
};

type ChatAttachment = {
  name: string;
  url: string;
  type: string;
  size: number;
  path?: string;
};

type ChatMember = {
  user_id: string;
  users?: {
    name: string;
    email?: string | null;
    role?: string | null;
    photo_url?: string | null;
  } | null;
};

type UserOption = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  photo_url?: string | null;
};

type EnrichedMessage = Message & {
  compact: boolean;
  showDateRule: boolean;
  dateLabel: string | null;
};

const CHAT_MUTED_GROUPS_KEY = "hydra-chat-muted-groups";
const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";
const MAX_CHAT_ATTACHMENT_SIZE = 50 * 1024 * 1024;

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

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentKind(type: string) {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return "file";
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

function isMissingAttachmentsColumn(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message || "")
      : "";
  return message.toLowerCase().includes("attachments");
}

function AttachmentIcon({ type }: { type: string }) {
  const kind = getAttachmentKind(type);
  if (kind === "image") return <ImageIcon size={15} />;
  if (kind === "video") return <Video size={15} />;
  return <FileText size={15} />;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<ChatMember[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [showMembersPanel, setShowMembersPanel] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [mutedGroupIds, setMutedGroupIds] = useState<string[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  const [isNarrow, setIsNarrow] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"list" | "chat">("list");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const senderNameCache = useRef<Record<string, string>>({});
  const notifiedPermissionRef = useRef(false);

  const canCreateGroup = canCreateChatGroup(currentUserRole);

  async function loadCurrentProfile() {
    const profile = await getCurrentProfile();
    setCurrentProfileId(profile?.id || null);
    setCurrentUserRole(profile?.role || null);
  }

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, municipality, state")
      .order("name", { ascending: true });
    if (error) {
      showErrorToast("Erro ao carregar projetos", getSupabaseErrorMessage(error));
      return;
    }
    setProjects(data || []);
  }

  async function loadUsers() {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, photo_url")
      .order("name", { ascending: true });
    if (error) {
      showErrorToast("Erro ao carregar pessoas", getSupabaseErrorMessage(error));
      return;
    }
    setUsers((data as UserOption[]) || []);
  }

  async function loadChatGroups() {
    const { data, error } = await supabase
      .from("chat_groups")
      .select("id, name, project_id, created_by")
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

  async function loadGroupMembers(groupId: string) {
    if (!groupId) {
      setGroupMembers([]);
      return;
    }
    const { data, error } = await supabase
      .from("chat_group_members")
      .select("user_id, users:user_id (name, email, role, photo_url)")
      .eq("chat_group_id", groupId)
      .order("created_at", { ascending: true });
    if (error) {
      setGroupMembers([]);
      return;
    }
    setGroupMembers((data as unknown as ChatMember[]) || []);
  }

  async function loadMessages(groupId: string) {
    if (!groupId) {
      setMessages([]);
      return;
    }
    const query = supabase
      .from("messages")
      .select(
        "id, content, attachments, sender_id, created_at, project_id, chat_group_id, users:sender_id (name, email, role)"
      )
      .eq("chat_group_id", groupId)
      .order("created_at", { ascending: true });
    const { data, error } = await query;

    if (error && isMissingAttachmentsColumn(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("messages")
        .select(
          "id, content, sender_id, created_at, project_id, chat_group_id, users:sender_id (name, email, role)"
        )
        .eq("chat_group_id", groupId)
        .order("created_at", { ascending: true });
      if (fallbackError) {
        showErrorToast("Erro ao carregar mensagens", getSupabaseErrorMessage(fallbackError));
        return;
      }
      setMessages(((fallbackData as unknown as Message[]) || []).map((m) => ({
        ...m,
        attachments: [],
      })));
      return;
    }

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
    const groupName = window.prompt("Nome do novo grupo:");
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

    await supabase.from("chat_group_members").insert({
      chat_group_id: group.id,
      user_id: profile.id,
      added_by: profile.id,
    });

    await loadChatGroups();
    await loadGroupMembers(group.id);
    setSelectedGroupId(group.id);
    if (isNarrow) setMobilePanel("chat");
    showSuccessToast("Grupo criado", "Grupo criado com sucesso.");
  }

  async function handleSendMessage() {
    const trimmed = content.trim();
    if ((!trimmed && selectedFiles.length === 0) || !selectedGroupId) return;

    const senderId =
      currentProfileId || (await getCurrentProfile())?.id || null;
    if (!senderId) {
      showErrorToast("Sessão inválida", "Entre novamente para enviar mensagens.");
      return;
    }

    setSending(true);
    const uploadedAttachments: ChatAttachment[] = [];
    for (const file of selectedFiles) {
      if (file.size > MAX_CHAT_ATTACHMENT_SIZE) {
        showErrorToast(
          "Arquivo muito grande",
          `${file.name} passa de ${formatFileSize(MAX_CHAT_ATTACHMENT_SIZE)}.`
        );
        setSending(false);
        return;
      }

      const safeName = sanitizeFileName(file.name);
      const path = `${selectedGroupId}/${senderId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        showErrorToast(
          "Erro ao anexar arquivo",
          `${getSupabaseErrorMessage(uploadError)}. Verifique se o bucket '${CHAT_ATTACHMENTS_BUCKET}' existe.`
        );
        setSending(false);
        return;
      }

      const { data } = supabase.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .getPublicUrl(path);
      uploadedAttachments.push({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        path,
        url: data.publicUrl,
      });
    }

    const messagePayload: {
      content: string;
      sender_id: string;
      chat_group_id: string;
      attachments?: ChatAttachment[];
    } = {
      content: trimmed,
      sender_id: senderId,
      chat_group_id: selectedGroupId,
    };

    if (uploadedAttachments.length > 0) {
      messagePayload.attachments = uploadedAttachments;
    }

    const { error } = await supabase.from("messages").insert(messagePayload);

    if (error) {
      const message =
        isMissingAttachmentsColumn(error) && uploadedAttachments.length > 0
          ? "Atualize o banco com lib/sql/chat-groups.sql para habilitar anexos."
          : getSupabaseErrorMessage(error);
      console.error("Erro ao enviar mensagem:", error);
      showErrorToast("Erro ao enviar mensagem", message);
      setSending(false);
      return;
    }

    setContent("");
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSending(false);
    showSuccessToast(
      uploadedAttachments.length > 0 ? "Mensagem com anexo enviada" : "Mensagem enviada",
      `Canal: ${channelTitle}`
    );
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const next = [...selectedFiles, ...files].slice(0, 8);
    setSelectedFiles(next);
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
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

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return "unsupported" as const;
    }

    if (Notification.permission === "granted") {
      setNotificationPermission("granted");
      return "granted" as const;
    }

    if (Notification.permission === "denied") {
      setNotificationPermission("denied");
      return "denied" as const;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      showSuccessToast(
        "Notificações ativadas",
        "Você receberá pop-up de novas mensagens no navegador."
      );
    }
    return permission;
  }, []);

  useEffect(() => {
    loadCurrentProfile();
    loadProjects();
    loadUsers();
    loadChatGroups();
  }, []);

  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
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
    if (selectedGroupId) {
      loadMessages(selectedGroupId);
      loadGroupMembers(selectedGroupId);
      return;
    }
    setMessages([]);
    setGroupMembers([]);
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
  const isSelectedAdHocGroup = !!selectedGroup && !selectedGroup.project_id;
  const canManageSelectedGroup =
    !!selectedGroup &&
    isSelectedAdHocGroup &&
    (canCreateGroup || selectedGroup.created_by === currentProfileId);

  const memberIds = useMemo(
    () => new Set(groupMembers.map((member) => member.user_id)),
    [groupMembers]
  );

  const availableUsersToAdd = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return users
      .filter((user) => !memberIds.has(user.id))
      .filter((user) => {
        if (!q) return true;
        return (
          user.name.toLowerCase().includes(q) ||
          (user.email || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [memberIds, memberSearch, users]);

  const projectById = useMemo(
    () =>
      Object.fromEntries(
        projects.map((project) => [
          project.id,
          formatProjectDisplayName(project),
        ])
      ),
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

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`Nova mensagem em ${groupLabel}`, {
        body: `${senderName}: ${text}`,
        tag: `chat-${payload.groupId}`,
      });
      return;
    }

    if (
      "Notification" in window &&
      Notification.permission === "default" &&
      !notifiedPermissionRef.current
    ) {
      notifiedPermissionRef.current = true;
      showInfoToast(
        "Ative as notificações",
        "Clique em 'Ativar pop-up' para receber alertas com o site minimizado."
      );
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
    setShowMembersPanel(false);
    if (isNarrow) setMobilePanel("chat");
  }

  async function addMember(userId: string) {
    if (!selectedGroupId || !canManageSelectedGroup) return;
    const { error } = await supabase.rpc("add_chat_group_member", {
      p_chat_group_id: selectedGroupId,
      p_user_id: userId,
    });
    if (error) {
      console.error("Erro ao adicionar pessoa ao grupo:", error);
      const message = error.message?.includes("Could not find the function")
        ? "Atualize o banco com lib/sql/chat-groups.sql e tente novamente."
        : getSupabaseErrorMessage(error);
      showErrorToast("Erro ao adicionar pessoa", message);
      return;
    }
    await loadGroupMembers(selectedGroupId);
    setMemberSearch("");
    showSuccessToast("Pessoa adicionada", "O grupo foi atualizado.");
  }

  async function removeMember(userId: string) {
    if (!selectedGroupId || !canManageSelectedGroup) return;
    if (userId === currentProfileId) {
      showErrorToast("Ação bloqueada", "Você não pode remover a si mesmo do grupo.");
      return;
    }
    const { error } = await supabase.rpc("remove_chat_group_member", {
      p_chat_group_id: selectedGroupId,
      p_user_id: userId,
    });
    if (error) {
      console.error("Erro ao remover pessoa do grupo:", error);
      const message = error.message?.includes("Could not find the function")
        ? "Atualize o banco com lib/sql/chat-groups.sql e tente novamente."
        : getSupabaseErrorMessage(error);
      showErrorToast("Erro ao remover pessoa", message);
      return;
    }
    await loadGroupMembers(selectedGroupId);
    showSuccessToast("Pessoa removida", "O acesso ao grupo foi atualizado.");
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
    await downloadChatTranscriptPdf({
      channelTitle,
      groupTypeLabel: selectedGroup?.project_id
        ? "Projeto vinculado"
        : "Grupo",
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
        description="Grupos por projeto e grupos gerais, mensagens em tempo real."
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
                  title="Novo grupo"
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
                      {isProjectGroup ? "Projeto" : "Grupo"}
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
                  leftIcon={<Users size={14} />}
                  onClick={() => setShowMembersPanel((prev) => !prev)}
                  disabled={!selectedGroupId}
                  title="Ver participantes do grupo"
                >
                  {groupMembers.length || (selectedGroup?.project_id ? "Projeto" : 0)}
                </Button>
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
                {notificationPermission !== "granted" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Bell size={14} />}
                    onClick={() => {
                      requestBrowserNotificationPermission();
                    }}
                    title="Permitir notificações no navegador"
                  >
                    Ativar pop-up
                  </Button>
                )}
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

            {showMembersPanel && selectedGroupId && (
              <section className="chat-members-panel">
                <div className="chat-members-head">
                  <div>
                    <h3 className="chat-members-title">Participantes</h3>
                    <p className="chat-members-sub">
                      {isSelectedAdHocGroup
                        ? "Controle quem participa deste grupo."
                        : "Grupos de projeto seguem a equipe vinculada ao projeto."}
                    </p>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setShowMembersPanel(false)}
                    title="Fechar participantes"
                  >
                    <X size={16} />
                  </Button>
                </div>

                <div className="chat-members-grid">
                  <div className="chat-members-list">
                    {groupMembers.length === 0 && (
                      <p className="text-sm text-muted">
                        {isSelectedAdHocGroup
                          ? "Nenhum participante cadastrado ainda."
                          : "Participantes do projeto aparecem conforme as regras de acesso."}
                      </p>
                    )}
                    {groupMembers.map((member) => (
                      <div key={member.user_id} className="chat-member-row">
                        <Avatar
                          name={member.users?.name || "Usuário"}
                          src={member.users?.photo_url || null}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="chat-member-name truncate">
                            {member.users?.name || "Usuário"}
                          </div>
                          <div className="chat-member-email truncate">
                            {member.users?.email || member.users?.role || "Sem e-mail"}
                          </div>
                        </div>
                        {canManageSelectedGroup && member.user_id !== currentProfileId && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => removeMember(member.user_id)}
                            title="Remover do grupo"
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {canManageSelectedGroup && (
                    <div className="chat-members-add">
                      <div className="chat-members-add-title">
                        <UserPlus size={15} />
                        Adicionar pessoa
                      </div>
                      <Input
                        placeholder="Buscar por nome ou e-mail..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                      />
                      <div className="chat-user-pick-list">
                        {availableUsersToAdd.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            className="chat-user-pick"
                            onClick={() => addMember(user.id)}
                          >
                            <Avatar name={user.name} src={user.photo_url} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="chat-member-name truncate">{user.name}</span>
                              <span className="chat-member-email truncate">
                                {user.email || user.role || "Sem e-mail"}
                              </span>
                            </span>
                            <Check size={14} />
                          </button>
                        ))}
                        {availableUsersToAdd.length === 0 && (
                          <p className="text-xs text-muted">Nenhuma pessoa disponível.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

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
                            {message.content && (
                              <p className="chat-bubble-text m-0">{message.content}</p>
                            )}
                            {message.attachments && message.attachments.length > 0 && (
                              <div className="chat-attachments">
                                {message.attachments.map((attachment, index) => {
                                  const kind = getAttachmentKind(attachment.type);
                                  return (
                                    <a
                                      key={`${attachment.url}-${index}`}
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`chat-attachment chat-attachment-${kind}`}
                                    >
                                      {kind === "image" ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={attachment.url}
                                          alt={attachment.name}
                                          className="chat-attachment-image"
                                        />
                                      ) : kind === "video" ? (
                                        <video
                                          src={attachment.url}
                                          className="chat-attachment-video"
                                          controls
                                        />
                                      ) : (
                                        <span className="chat-attachment-file-icon">
                                          <AttachmentIcon type={attachment.type} />
                                        </span>
                                      )}
                                      <span className="chat-attachment-meta">
                                        <span className="chat-attachment-name truncate">
                                          {attachment.name}
                                        </span>
                                        <span className="chat-attachment-size">
                                          {formatFileSize(attachment.size)}
                                          <ExternalLink size={11} />
                                        </span>
                                      </span>
                                    </a>
                                  );
                                })}
                              </div>
                            )}
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
              {selectedFiles.length > 0 && (
                <div className="chat-selected-files">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="chat-selected-file">
                      <span className="chat-selected-file-icon">
                        <AttachmentIcon type={file.type || "application/octet-stream"} />
                      </span>
                      <span className="chat-selected-file-meta min-w-0">
                        <span className="chat-selected-file-name truncate">{file.name}</span>
                        <span className="chat-selected-file-size">{formatFileSize(file.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSelectedFile(index)}
                        className="chat-selected-file-remove"
                        title="Remover anexo"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="chat-composer-inner">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt"
                  className="hidden"
                  onChange={handlePickFiles}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedGroupId || sending}
                  title="Anexar fotos, vídeos, prints e arquivos"
                  className="chat-attach-button"
                >
                  <Paperclip size={17} />
                </Button>
                <Textarea
                  placeholder={
                    selectedGroupId
                      ? "Mensagem, print, foto, vídeo ou arquivo..."
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
                  disabled={!selectedGroupId || (!content.trim() && selectedFiles.length === 0)}
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
            linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 86%, var(--primary) 4%), var(--surface-2)),
            var(--surface-2);
        }

        .chat-members-panel {
          flex-shrink: 0;
          border-bottom: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 92%, var(--primary) 3%);
          padding: 14px 18px;
          box-shadow: var(--shadow-xs);
        }

        .chat-members-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .chat-members-title {
          font-size: 14px;
          font-weight: 800;
          line-height: 1.2;
        }

        .chat-members-sub {
          font-size: 12px;
          color: var(--muted-fg);
          margin-top: 2px;
        }

        .chat-members-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
          gap: 14px;
          align-items: start;
        }

        .chat-members-list,
        .chat-user-pick-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 210px;
          overflow-y: auto;
        }

        .chat-member-row,
        .chat-user-pick {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 8px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--surface);
          min-width: 0;
        }

        .chat-user-pick {
          width: 100%;
          cursor: pointer;
          text-align: left;
          color: var(--foreground);
        }

        .chat-user-pick:hover {
          border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
          background: var(--primary-soft);
        }

        .chat-member-name {
          display: block;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
        }

        .chat-member-email {
          display: block;
          font-size: 11px;
          color: var(--muted-fg);
          line-height: 1.25;
          margin-top: 2px;
        }

        .chat-members-add {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .chat-members-add-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 800;
          color: var(--primary);
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

        .chat-attachments {
          display: grid;
          gap: 8px;
          margin-top: 8px;
          min-width: min(280px, 70vw);
        }

        .chat-attachment {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr);
          gap: 9px;
          align-items: center;
          color: inherit;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
          background: color-mix(in srgb, var(--surface) 72%, transparent);
        }

        .chat-bubble-mine .chat-attachment {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.2);
        }

        .chat-attachment-image,
        .chat-attachment-video {
          grid-column: 1 / -1;
          width: 100%;
          max-height: 340px;
          object-fit: cover;
          background: #000;
          display: block;
        }

        .chat-attachment-file-icon {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
        }

        .chat-bubble-mine .chat-attachment-file-icon {
          color: #fff;
        }

        .chat-attachment-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          padding: 8px 10px 8px 0;
        }

        .chat-attachment-image + .chat-attachment-meta,
        .chat-attachment-video + .chat-attachment-meta {
          grid-column: 1 / -1;
          padding: 8px 10px 10px;
        }

        .chat-attachment-name {
          font-size: 12px;
          font-weight: 700;
        }

        .chat-attachment-size {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          opacity: 0.78;
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

        .chat-selected-files {
          max-width: 920px;
          margin: 0 auto 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .chat-selected-file {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: min(320px, 100%);
          padding: 7px 8px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface-2);
        }

        .chat-selected-file-icon {
          color: var(--primary);
          display: inline-flex;
          flex-shrink: 0;
        }

        .chat-selected-file-meta {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }

        .chat-selected-file-name {
          font-size: 12px;
          font-weight: 700;
        }

        .chat-selected-file-size {
          font-size: 10px;
          color: var(--muted-fg);
          margin-top: 2px;
        }

        .chat-selected-file-remove {
          border: 0;
          background: transparent;
          color: var(--muted-fg);
          display: inline-flex;
          cursor: pointer;
          padding: 2px;
          border-radius: 999px;
          flex-shrink: 0;
        }

        .chat-selected-file-remove:hover {
          color: var(--danger);
          background: var(--danger-soft);
        }

        .chat-attach-button {
          margin: 8px 0 8px 4px;
          flex-shrink: 0;
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
          .chat-thread-header {
            align-items: flex-start;
          }
          .chat-members-grid {
            grid-template-columns: 1fr;
          }
          .chat-composer-inner {
            gap: 6px;
          }
          .chat-composer-send span:last-child {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
