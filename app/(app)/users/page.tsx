"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users as UsersIcon, Search, X } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
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
  role: "employee",
  phone: "",
  date_of_birth: "",
  job_title: "",
  department: "",
  floor_number: "",
  address: "",
  bio: "",
  linkedin_url: "",
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  coordinator: "Coordenador",
  leader: "Líder",
  employee: "Colaborador",
};

function getRoleVariant(role: string): "primary" | "info" | "neutral" | "warning" {
  if (role === "admin") return "warning";
  if (role === "manager" || role === "coordinator") return "primary";
  if (role === "leader") return "info";
  return "neutral";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3 mt-4 border-b border-border pb-1">
      {children}
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewUserForm>(emptyForm);
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  function setField(field: keyof NewUserForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar usuários:", error.message);
      setLoading(false);
      return;
    }

    setUsers(data || []);
    setLoading(false);
  }

  async function handleCreateUser() {
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
    setShowForm(false);
    await loadUsers();
    setCreating(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term);
      const matchesRole = roleFilter ? user.role === roleFilter : true;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.is_active).length,
  }), [users]);

  const hasFilter = !!(search || roleFilter);

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Gerencie perfis internos, papéis e o status da equipe."
        actions={
          <Button leftIcon={<Plus size={16} />} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Fechar" : "Novo usuário"}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-4">
          {/* Acesso */}
          <SectionLabel>Acesso</SectionLabel>
          <div className="grid-3" style={{ alignItems: "end" }}>
            <Field label="Nome *">
              <Input
                placeholder="Nome completo"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </Field>
            <Field label="E-mail *">
              <Input
                type="email"
                placeholder="email@empresa.com"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
              />
            </Field>
            <Field label="Perfil *">
              <Select value={form.role} onChange={(e) => setField("role", e.target.value)}>
                <option value="admin">Administrador</option>
                <option value="manager">Gerente</option>
                <option value="coordinator">Coordenador</option>
                <option value="leader">Líder</option>
                <option value="employee">Colaborador</option>
              </Select>
            </Field>
          </div>

          {/* Informações pessoais */}
          <SectionLabel>Informações Pessoais</SectionLabel>
          <div className="grid-3" style={{ alignItems: "end" }}>
            <Field label="Telefone">
              <Input
                type="tel"
                placeholder="+55 11 99999-0000"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
              />
            </Field>
            <Field label="Data de nascimento">
              <Input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setField("date_of_birth", e.target.value)}
              />
            </Field>
            <Field label="Endereço">
              <Input
                placeholder="Rua, número, cidade"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
              />
            </Field>
          </div>

          {/* Trabalho */}
          <SectionLabel>Trabalho</SectionLabel>
          <div className="grid-3" style={{ alignItems: "end" }}>
            <Field label="Cargo">
              <Input
                placeholder="Ex: Analista de Sistemas"
                value={form.job_title}
                onChange={(e) => setField("job_title", e.target.value)}
              />
            </Field>
            <Field label="Departamento">
              <Input
                placeholder="Ex: Tecnologia"
                value={form.department}
                onChange={(e) => setField("department", e.target.value)}
              />
            </Field>
            <Field label="Andar">
              <Input
                type="number"
                placeholder="Ex: 3"
                value={form.floor_number}
                onChange={(e) => setField("floor_number", e.target.value)}
              />
            </Field>
          </div>

          {/* Extras */}
          <SectionLabel>Extras</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="LinkedIn">
              <Input
                type="url"
                placeholder="https://linkedin.com/in/..."
                value={form.linkedin_url}
                onChange={(e) => setField("linkedin_url", e.target.value)}
              />
            </Field>
            <Field label="Biografia">
              <Input
                placeholder="Breve descrição sobre a pessoa"
                value={form.bio}
                onChange={(e) => setField("bio", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex gap-2 mt-5">
            <Button
              onClick={handleCreateUser}
              loading={creating}
              disabled={!form.name.trim() || !form.email.trim()}
            >
              Cadastrar
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setForm(emptyForm); }}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--subtle-fg)",
              }}
            />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ width: "auto", minWidth: 180 }}
          >
            <option value="">Todos os perfis</option>
            <option value="admin">Administrador</option>
            <option value="manager">Gerente</option>
            <option value="coordinator">Coordenador</option>
            <option value="leader">Líder</option>
            <option value="employee">Colaborador</option>
          </Select>
          {hasFilter && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<X size={14} />}
              onClick={() => { setSearch(""); setRoleFilter(""); }}
            >
              Limpar
            </Button>
          )}
          <div className="text-sm text-muted" style={{ marginLeft: "auto" }}>
            {stats.total} cadastrados • {stats.active} ativos
          </div>
        </div>
      </Card>

      <Card padded={false}>
        {loading ? (
          <div className="card-padded flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton style={{ width: 32, height: 32, borderRadius: 999 }} />
                <Skeleton style={{ height: 14, flex: 1 }} />
                <Skeleton style={{ width: 80, height: 22, borderRadius: 999 }} />
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="card-padded">
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
                  <Button variant="secondary" onClick={() => { setSearch(""); setRoleFilter(""); }}>
                    Limpar filtros
                  </Button>
                ) : (
                  <Button leftIcon={<Plus size={16} />} onClick={() => setShowForm(true)}>
                    Novo usuário
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => router.push(`/users/${user.id}`)}
                    style={{ cursor: "pointer" }}
                    className="hover:bg-surface-2 transition-colors"
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} primary />
                        <span className="font-semibold">{user.name}</span>
                      </div>
                    </td>
                    <td className="text-muted">{user.email}</td>
                    <td>
                      <Badge variant={getRoleVariant(user.role)}>
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={user.is_active ? "success" : "neutral"} dot>
                        {user.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
