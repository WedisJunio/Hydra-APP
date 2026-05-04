"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Users as UsersIcon,
  Search,
  X,
  Mail,
  Phone,
  Building2,
  Briefcase,
  LayoutGrid,
  List,
  CheckCircle2,
  XCircle,
  Pencil,
  Filter,
  UserCheck,
  Crown,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ROLE_LABELS, canCreateAppUsers, isLegacyAppRole } from "@/lib/permissions";
import { EditProfileModal } from "@/components/user-profile/edit-profile-modal";
import type { UserProfile } from "@/lib/user-profile/types";
import { getUserProfile } from "@/lib/user-profile/data";

// ─── Types ───────────────────────────────────────────────────────────────────

type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  job_title?: string | null;
  department?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  created_at?: string;
};

type NewUserForm = {
  name: string;
  email: string;
  role: string;
  phone: string;
  date_of_birth: string;
  job_title: string;
  department: string;
  floor_number: string;
  address: string;
  bio: string;
  linkedin_url: string;
};

const emptyForm: NewUserForm = {
  name: "",
  email: "",
  role: "projetista",
  phone: "",
  date_of_birth: "",
  job_title: "",
  department: "",
  floor_number: "",
  address: "",
  bio: "",
  linkedin_url: "",
};

type ViewMode = "grid" | "list";
type StatusFilter = "all" | "active" | "inactive";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRoleVariant(role: string): "primary" | "info" | "neutral" | "warning" {
  if (role === "admin") return "warning";
  if (role === "manager" || role === "coordinator") return "primary";
  if (role === "leader" || role === "projetista_lider") return "info";
  return "neutral";
}

function getRoleIcon(role: string) {
  if (role === "admin") return <Crown size={11} />;
  if (role === "manager" || role === "coordinator") return <UserCheck size={11} />;
  return null;
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon,
  variant = "primary",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "info";
}) {
  const colorMap = {
    primary: "var(--primary)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    info: "var(--info)",
  } as const;
  const color = colorMap[variant];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>
      <div className="text-xs text-muted" style={{ fontWeight: 500 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
          lineHeight: 1.15,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function UserCard({
  user,
  onView,
  onEdit,
  canEdit,
}: {
  user: UserListItem;
  onView: () => void;
  onEdit?: () => void;
  canEdit: boolean;
}) {
  return (
    <div
      onClick={onView}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
        cursor: "pointer",
        transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
        position: "relative",
        opacity: user.is_active ? 1 : 0.65,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.06), 0 0 0 3px var(--primary-soft)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Status pill no canto superior direito */}
      <div style={{ position: "absolute", top: 14, right: 14 }}>
        <Badge variant={user.is_active ? "success" : "neutral"} dot>
          {user.is_active ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      <div className="flex flex-col items-center text-center">
        <Avatar
          name={user.name}
          src={user.photo_url ?? undefined}
          size="xl"
          style={{ width: 64, height: 64, marginBottom: 12 }}
        />
        <h3
          style={{
            fontSize: 15,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.01em",
            color: "var(--foreground)",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingLeft: 24,
            paddingRight: 24,
          }}
        >
          {user.name}
        </h3>
        {user.job_title && (
          <p
            className="text-sm text-muted"
            style={{
              margin: "2px 0 0",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.job_title}
          </p>
        )}

        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Badge variant={getRoleVariant(user.role)}>
            {getRoleIcon(user.role)}
            <span style={{ marginLeft: getRoleIcon(user.role) ? 4 : 0 }}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </Badge>
          {user.department && (
            <span
              className="text-xs"
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--surface-2)",
                color: "var(--muted-fg)",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Building2 size={10} />
              {user.department}
            </span>
          )}
        </div>
      </div>

      {/* Footer com email + ações */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <a
          href={`mailto:${user.email}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs text-muted truncate"
          style={{ flex: 1, minWidth: 0 }}
          title={user.email}
        >
          <Mail size={12} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.email}
          </span>
        </a>
        {canEdit && onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Editar"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              borderRadius: 8,
              width: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--muted-fg)",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--primary)";
              e.currentTarget.style.borderColor = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--muted-fg)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<NewUserForm>(emptyForm);
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [myRole, setMyRole] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // Modal de edição
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  function setField(field: keyof NewUserForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, is_active, created_at, job_title, department, phone, photo_url")
      .order("name", { ascending: true });

    if (error) {
      console.error("Erro ao buscar usuários:", error.message);
      setLoading(false);
      return;
    }

    setUsers(data || []);
    setLoading(false);
  }

  async function handleCreateUser() {
    if (!canCreateAppUsers(myRole)) {
      showErrorToast("Sem permissão para cadastrar usuários.");
      return;
    }
    if (!form.name.trim() || !form.email.trim()) return;
    setCreating(true);

    const placeholderHash = `disabled:${crypto.randomUUID()}`;
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      password_hash: placeholderHash,
      is_active: true,
    };

    if (form.phone) payload.phone = form.phone.trim();
    if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
    if (form.job_title) payload.job_title = form.job_title.trim();
    if (form.department) payload.department = form.department.trim();
    if (form.floor_number) payload.floor_number = Number(form.floor_number);
    if (form.address) payload.address = form.address.trim();
    if (form.bio) payload.bio = form.bio.trim();
    if (form.linkedin_url) payload.linkedin_url = form.linkedin_url.trim();

    const { error } = await supabase.from("users").insert(payload);
    if (error) {
      showErrorToast("Erro ao criar usuário: " + error.message);
      setCreating(false);
      return;
    }

    showSuccessToast("Usuário cadastrado com sucesso");
    setForm(emptyForm);
    setShowCreateModal(false);
    await loadUsers();
    setCreating(false);
  }

  async function handleOpenEdit(userId: string) {
    setLoadingProfile(true);
    const profile = await getUserProfile(userId);
    if (profile) {
      setEditingProfile(profile);
    } else {
      showErrorToast("Não foi possível carregar o perfil");
    }
    setLoadingProfile(false);
  }

  function handleProfileSaved(updated: UserProfile) {
    // Atualiza o usuário na lista sem precisar recarregar tudo
    setUsers((prev) =>
      prev.map((u) =>
        u.id === updated.id
          ? {
              ...u,
              name: updated.full_name || updated.name || u.name,
              role: updated.role,
              is_active: updated.is_active,
              job_title: updated.job_title ?? null,
              department: updated.department ?? null,
              phone: updated.phone ?? null,
              photo_url: updated.photo_url ?? null,
            }
          : u
      )
    );
  }

  useEffect(() => {
    getCurrentProfile().then((p) => {
      setMyRole(p?.role ?? null);
      setMyUserId(p?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (myRole == null) return;
    if (!isLegacyAppRole(myRole)) {
      router.replace("/dashboard");
      return;
    }
    loadUsers();
  }, [myRole, router]);

  // Esc fecha modal de criação
  useEffect(() => {
    if (!showCreateModal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !creating) {
        setShowCreateModal(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCreateModal, creating]);

  // Lista única de departamentos
  const departments = useMemo(
    () => [...new Set(users.map((u) => u.department).filter(Boolean))].sort() as string[],
    [users]
  );

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.job_title || "").toLowerCase().includes(term);
      const matchesRole = roleFilter ? user.role === roleFilter : true;
      const matchesDept = departmentFilter ? user.department === departmentFilter : true;
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
          ? user.is_active
          : !user.is_active;
      return matchesSearch && matchesRole && matchesDept && matchesStatus;
    });
  }, [users, search, roleFilter, departmentFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.is_active).length;
    const inactive = total - active;
    const leadership = users.filter((u) =>
      ["admin", "manager", "coordinator", "leader"].includes(u.role)
    ).length;
    const departmentsCount = departments.length;
    return { total, active, inactive, leadership, departmentsCount };
  }, [users, departments]);

  const allowCreate = canCreateAppUsers(myRole);
  const allowEdit = canCreateAppUsers(myRole); // mesmas permissões para editar
  const hasFilter = !!(search || roleFilter || departmentFilter || statusFilter !== "all");

  // ─── Modal de criação ──────────────────────────────────────────────────────
  const createModal = showCreateModal && (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      onClick={() => !creating && setShowCreateModal(false)}
    >
      <div
        style={{
          background: "var(--background)",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, var(--primary-soft) 0%, transparent 100%)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold" style={{ letterSpacing: "-0.01em" }}>
                Novo usuário
              </h2>
              <p className="text-sm text-muted" style={{ marginTop: 2 }}>
                Cadastre uma nova pessoa na plataforma
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setShowCreateModal(false)}
              disabled={creating}
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Body scrollable */}
        <div style={{ overflowY: "auto", padding: 24, flex: 1 }}>
          {/* Acesso */}
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            Acesso
          </div>
          <div className="grid-3 mb-5" style={{ alignItems: "end" }}>
            <Field label="Nome *">
              <Input
                placeholder="Nome completo"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={creating}
              />
            </Field>
            <Field label="E-mail *">
              <Input
                type="email"
                placeholder="email@empresa.com"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                disabled={creating}
              />
            </Field>
            <Field label="Perfil *">
              <Select
                value={form.role}
                onChange={(e) => setField("role", e.target.value)}
                disabled={creating}
              >
                <option value="admin">Administrador</option>
                <option value="manager">Gerente</option>
                <option value="coordinator">Coordenador</option>
                <option value="leader">Líder</option>
                <option value="projetista_lider">Projetista líder</option>
                <option value="projetista">Projetista</option>
                <option value="employee">Projetista (legado)</option>
              </Select>
            </Field>
          </div>

          {/* Trabalho */}
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            Trabalho
          </div>
          <div className="grid-3 mb-5" style={{ alignItems: "end" }}>
            <Field label="Cargo">
              <Input
                placeholder="Ex: Engenheiro Sênior"
                value={form.job_title}
                onChange={(e) => setField("job_title", e.target.value)}
                disabled={creating}
              />
            </Field>
            <Field label="Departamento">
              <Input
                placeholder="Ex: Engenharia"
                value={form.department}
                onChange={(e) => setField("department", e.target.value)}
                disabled={creating}
              />
            </Field>
            <Field label="Andar">
              <Input
                type="number"
                placeholder="Ex: 3"
                value={form.floor_number}
                onChange={(e) => setField("floor_number", e.target.value)}
                disabled={creating}
              />
            </Field>
          </div>

          {/* Pessoal */}
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
            Informações pessoais
          </div>
          <div className="grid-2 mb-3">
            <Field label="Telefone">
              <Input
                type="tel"
                placeholder="+55 11 99999-0000"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                disabled={creating}
              />
            </Field>
            <Field label="Data de nascimento">
              <Input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setField("date_of_birth", e.target.value)}
                disabled={creating}
              />
            </Field>
          </div>
          <Field label="Endereço" className="mb-3">
            <Input
              placeholder="Rua, número, cidade"
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              disabled={creating}
            />
          </Field>
          <div className="grid-2 mb-3">
            <Field label="LinkedIn">
              <Input
                type="url"
                placeholder="https://linkedin.com/in/..."
                value={form.linkedin_url}
                onChange={(e) => setField("linkedin_url", e.target.value)}
                disabled={creating}
              />
            </Field>
            <Field label="Biografia">
              <Input
                placeholder="Breve descrição"
                value={form.bio}
                onChange={(e) => setField("bio", e.target.value)}
                disabled={creating}
              />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            background: "var(--surface-2)",
          }}
        >
          <Button
            variant="ghost"
            onClick={() => {
              setShowCreateModal(false);
              setForm(emptyForm);
            }}
            disabled={creating}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCreateUser}
            loading={creating}
            disabled={creating || !form.name.trim() || !form.email.trim()}
          >
            Cadastrar
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Usuários"
        description={
          myRole != null && !allowCreate
            ? "Diretório da equipe. Cadastro de novos usuários é restrito a administradores e gerentes."
            : "Gerencie perfis internos, papéis e o status da equipe."
        }
        actions={
          allowCreate ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => setShowCreateModal(true)}>
              Novo usuário
            </Button>
          ) : undefined
        }
      />

      {/* ── Stats tiles ── */}
      {!loading && users.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatTile
            label="Total"
            value={stats.total}
            icon={<UsersIcon size={16} />}
            variant="primary"
          />
          <StatTile
            label="Ativos"
            value={stats.active}
            icon={<CheckCircle2 size={16} />}
            variant="success"
          />
          <StatTile
            label="Inativos"
            value={stats.inactive}
            icon={<XCircle size={16} />}
            variant="danger"
          />
          <StatTile
            label="Liderança"
            value={stats.leadership}
            icon={<Crown size={16} />}
            variant="warning"
          />
          <StatTile
            label="Departamentos"
            value={stats.departmentsCount}
            icon={<Building2 size={16} />}
            variant="info"
          />
        </div>
      )}

      {/* ── Toolbar de filtros ── */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Busca */}
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--subtle-fg)",
                pointerEvents: "none",
              }}
            />
            <Input
              placeholder="Buscar por nome, e-mail ou cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>

          {/* Filtro de papel */}
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ width: "auto", minWidth: 160 }}
          >
            <option value="">Todos os perfis</option>
            <option value="admin">Administrador</option>
            <option value="manager">Gerente</option>
            <option value="coordinator">Coordenador</option>
            <option value="leader">Líder</option>
            <option value="projetista_lider">Projetista líder</option>
            <option value="projetista">Projetista</option>
            <option value="employee">Projetista (legado)</option>
          </Select>

          {/* Filtro de departamento */}
          {departments.length > 0 && (
            <Select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={{ width: "auto", minWidth: 160 }}
            >
              <option value="">Todos departamentos</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          )}

          {/* Filtro de status (segmented control) */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              padding: 2,
              background: "var(--surface-2)",
            }}
          >
            {[
              { v: "all", label: "Todos" },
              { v: "active", label: "Ativos" },
              { v: "inactive", label: "Inativos" },
            ].map(({ v, label }) => {
              const isOn = statusFilter === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStatusFilter(v as StatusFilter)}
                  style={{
                    padding: "5px 11px",
                    border: "none",
                    background: isOn ? "var(--primary)" : "transparent",
                    color: isOn ? "#fff" : "var(--muted-fg)",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {hasFilter && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<X size={14} />}
              onClick={() => {
                setSearch("");
                setRoleFilter("");
                setDepartmentFilter("");
                setStatusFilter("all");
              }}
            >
              Limpar
            </Button>
          )}

          {/* Toggle grid / lista */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              marginLeft: "auto",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Visualização em cards"
              style={{
                padding: "6px 10px",
                border: "none",
                background: viewMode === "grid" ? "var(--primary-soft)" : "transparent",
                color: viewMode === "grid" ? "var(--primary)" : "var(--muted-fg)",
                borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
                cursor: "pointer",
              }}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="Visualização em lista"
              style={{
                padding: "6px 10px",
                border: "none",
                background: viewMode === "list" ? "var(--primary-soft)" : "transparent",
                color: viewMode === "list" ? "var(--primary)" : "var(--muted-fg)",
                borderRadius: "0 var(--radius-md) var(--radius-md) 0",
                cursor: "pointer",
              }}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Info sobre quantidade filtrada */}
        {!loading && users.length > 0 && (
          <div
            className="text-xs text-muted"
            style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}
          >
            <Filter size={11} />
            Mostrando <strong style={{ color: "var(--foreground)" }}>{filteredUsers.length}</strong> de {stats.total}
          </div>
        )}
      </Card>

      {/* ── Lista de usuários ── */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: viewMode === "grid"
              ? "repeat(auto-fill, minmax(240px, 1fr))"
              : "1fr",
            gap: 12,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={{ height: viewMode === "grid" ? 220 : 64 }} />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersIcon size={22} />}
            title={hasFilter ? "Nenhum usuário encontrado" : "Sem usuários cadastrados"}
            description={
              hasFilter
                ? "Tente ajustar os filtros ou a busca."
                : "Cadastre o primeiro usuário pra montar sua equipe."
            }
            action={
              hasFilter ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setRoleFilter("");
                    setDepartmentFilter("");
                    setStatusFilter("all");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : (
                allowCreate && (
                  <Button leftIcon={<Plus size={16} />} onClick={() => setShowCreateModal(true)}>
                    Novo usuário
                  </Button>
                )
              )
            }
          />
        </Card>
      ) : viewMode === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {filteredUsers.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onView={() => router.push(`/users/${user.id}`)}
              onEdit={allowEdit ? () => handleOpenEdit(user.id) : undefined}
              canEdit={allowEdit}
            />
          ))}
        </div>
      ) : (
        <Card padded={false}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Cargo</th>
                  <th>Departamento</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  {allowEdit && <th style={{ width: 60 }}></th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => router.push(`/users/${user.id}`)}
                    style={{ cursor: "pointer", opacity: user.is_active ? 1 : 0.65 }}
                    className="hover:bg-surface-2 transition-colors"
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} src={user.photo_url ?? undefined} primary />
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{user.name}</div>
                          <div className="text-xs text-muted truncate">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-sm">{user.job_title || <span className="text-muted">—</span>}</td>
                    <td className="text-sm">
                      {user.department ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 size={11} className="text-muted" />
                          {user.department}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <Badge variant={getRoleVariant(user.role)}>
                        {ROLE_LABELS[user.role] || user.role}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={user.is_active ? "success" : "neutral"} dot>
                        {user.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    {allowEdit && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(user.id)}
                          title="Editar"
                          disabled={loadingProfile}
                        >
                          <Pencil size={13} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal de criação */}
      {createModal}

      {/* Modal de edição */}
      {editingProfile && (
        <EditProfileModal
          profile={editingProfile}
          viewerRole={myRole}
          isOpen={true}
          onClose={() => setEditingProfile(null)}
          onSave={(updated) => {
            handleProfileSaved(updated);
            setEditingProfile(null);
          }}
        />
      )}
    </div>
  );
}
