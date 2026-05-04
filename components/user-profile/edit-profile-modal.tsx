"use client";

import { useEffect, useRef, useState } from "react";
import type { UserProfile, UserProfileUpdate } from "@/lib/user-profile/types";
import { updateUserProfile } from "@/lib/user-profile/data";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, ROLE_LABELS } from "@/lib/user-profile/types";
import { canAssignUserRoles, USER_ROLE_ASSIGN_OPTIONS } from "@/lib/permissions";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Camera, X, User as UserIcon, Briefcase, MapPin, Phone, Linkedin,
  Cake, Building2, Clock, Shield, Trash2, CheckCircle2, XCircle,
} from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

function SectionHeader({ icon: Icon, title, description }: {
  icon: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-3 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        style={{
          width: 32, height: 32,
          borderRadius: "var(--radius-md)",
          background: "var(--primary-soft)",
          color: "var(--primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{title}</h3>
        {description && (
          <p className="text-xs text-muted" style={{ marginTop: 1 }}>{description}</p>
        )}
      </div>
    </div>
  );
}

export function EditProfileModal({
  profile,
  viewerRole,
  isOpen,
  onClose,
  onSave,
}: {
  profile: UserProfile;
  /** Papel de quem abriu o modal — define se pode alterar o campo "Nível" (role). */
  viewerRole: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedProfile: UserProfile) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [activeTab, setActiveTab] = useState<"pessoal" | "trabalho" | "acesso">("pessoal");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEditRole = canAssignUserRoles(viewerRole);

  const buildInitial = (): UserProfileUpdate => ({
    full_name: profile.full_name,
    job_title: profile.job_title,
    department: profile.department,
    bio: profile.bio,
    phone: profile.phone,
    address: profile.address,
    floor_number: profile.floor_number,
    date_of_birth: profile.date_of_birth,
    linkedin_url: profile.linkedin_url,
    work_start_time: profile.work_start_time,
    work_end_time: profile.work_end_time,
    availability_status: profile.availability_status,
    photo_url: profile.photo_url,
    is_active: profile.is_active,
    ...(canEditRole ? { role: profile.role } : {}),
  });

  const [formData, setFormData] = useState<UserProfileUpdate>(buildInitial);

  useEffect(() => {
    if (!isOpen) return;
    setFormData(buildInitial());
    setActiveTab("pessoal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, profile.id, profile.updated_at]);

  function set<K extends keyof UserProfileUpdate>(field: K, value: UserProfileUpdate[K] | null) {
    setFormData((prev) => {
      const cleared = value === null || value === "" || (typeof value === "number" && Number.isNaN(value));
      return { ...prev, [field]: cleared ? undefined : value };
    });
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showErrorToast("A foto deve ter no máximo 5MB");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${profile.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      set("photo_url", data.publicUrl + `?t=${Date.now()}`);
      showSuccessToast("Foto enviada com sucesso");
    } catch {
      showErrorToast("Erro ao enviar foto. Verifique se o bucket 'avatars' existe no Supabase Storage.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemovePhoto() {
    set("photo_url", null);
  }

  async function handleSave() {
    setLoading(true);
    const payload: UserProfileUpdate = { ...formData };
    if (!canEditRole) delete payload.role;

    const result = await updateUserProfile(profile.id, payload);

    if (result.success) {
      showSuccessToast("Perfil atualizado com sucesso");
      onSave({
        ...profile,
        ...payload,
        updated_at: new Date().toISOString(),
      } as UserProfile);
      onClose();
    } else {
      showErrorToast(result.error || "Erro ao atualizar perfil");
    }
    setLoading(false);
  }

  // Esc fecha o modal
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const displayName = formData.full_name || profile.name;
  const displayPhoto = formData.photo_url;
  const isActive = formData.is_active ?? profile.is_active;

  return (
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
      onClick={onClose}
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
        {/* Header com gradiente sutil */}
        <div
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, var(--primary-soft) 0%, transparent 100%)",
            borderBottom: "1px solid var(--border)",
            position: "relative",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {/* Avatar com botão de troca */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <Avatar
                  name={displayName}
                  src={displayPhoto}
                  size="xl"
                  style={{ width: 72, height: 72, borderRadius: "var(--radius-lg)" }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto || loading}
                  title="Alterar foto"
                  style={{
                    position: "absolute",
                    bottom: -4,
                    right: -4,
                    background: "var(--primary)",
                    color: "#fff",
                    border: "3px solid var(--background)",
                    borderRadius: "50%",
                    width: 30,
                    height: 30,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: uploadingPhoto || loading ? "not-allowed" : "pointer",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <Camera size={13} />
                </button>
                {displayPhoto && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={uploadingPhoto || loading}
                    title="Remover foto"
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -4,
                      background: "var(--danger)",
                      color: "#fff",
                      border: "3px solid var(--background)",
                      borderRadius: "50%",
                      width: 24,
                      height: 24,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: uploadingPhoto || loading ? "not-allowed" : "pointer",
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>

              <div className="min-w-0">
                <h2 className="text-lg font-bold truncate" style={{ letterSpacing: "-0.01em" }}>
                  Editar perfil
                </h2>
                <p className="text-sm text-muted truncate">{displayName}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge variant={isActive ? "success" : "neutral"} dot>
                    {isActive ? "Ativo" : "Inativo"}
                  </Badge>
                  {uploadingPhoto && (
                    <span className="text-xs text-muted">Enviando foto...</span>
                  )}
                </div>
              </div>
            </div>

            <Button size="icon-sm" variant="ghost" onClick={onClose} disabled={loading} title="Fechar">
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            padding: "0 24px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {([
            { key: "pessoal", label: "Pessoal", icon: UserIcon },
            { key: "trabalho", label: "Trabalho", icon: Briefcase },
            ...(canEditRole ? [{ key: "acesso" as const, label: "Acesso", icon: Shield }] : []),
          ] as { key: typeof activeTab; label: string; icon: React.ElementType }[]).map((tab) => {
            const Icon = tab.icon;
            const isActiveTab = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "12px 16px",
                  border: "none",
                  background: "transparent",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: isActiveTab ? "var(--primary)" : "var(--muted-fg)",
                  borderBottom: `2px solid ${isActiveTab ? "var(--primary)" : "transparent"}`,
                  marginBottom: -1,
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo das abas (scrollable) */}
        <div style={{ overflowY: "auto", padding: 24, flex: 1 }}>
          {/* ── Aba: Pessoal ── */}
          {activeTab === "pessoal" && (
            <>
              <SectionHeader
                icon={UserIcon}
                title="Identificação"
                description="Como a pessoa é identificada na plataforma"
              />
              <div className="grid-2" style={{ marginBottom: 24 }}>
                <Field label="Nome completo">
                  <Input
                    type="text"
                    value={formData.full_name || ""}
                    onChange={(e) => set("full_name", e.target.value)}
                    disabled={loading}
                    placeholder={profile.name}
                  />
                </Field>
                <Field label="Data de nascimento">
                  <Input
                    type="date"
                    value={formData.date_of_birth || ""}
                    onChange={(e) => set("date_of_birth", e.target.value)}
                    disabled={loading}
                  />
                </Field>
              </div>

              <SectionHeader
                icon={Phone}
                title="Contato"
                description="Onde encontrar a pessoa"
              />
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <Field label="Telefone">
                  <Input
                    type="tel"
                    value={formData.phone || ""}
                    onChange={(e) => set("phone", e.target.value)}
                    disabled={loading}
                    placeholder="+55 11 99999-0000"
                  />
                </Field>
                <Field label="LinkedIn">
                  <Input
                    type="url"
                    value={formData.linkedin_url || ""}
                    onChange={(e) => set("linkedin_url", e.target.value)}
                    disabled={loading}
                    placeholder="https://linkedin.com/in/..."
                  />
                </Field>
              </div>
              <Field label="Endereço">
                <Input
                  type="text"
                  value={formData.address || ""}
                  onChange={(e) => set("address", e.target.value)}
                  disabled={loading}
                  placeholder="Rua, número, cidade"
                />
              </Field>

              <div style={{ marginTop: 24 }}>
                <SectionHeader icon={UserIcon} title="Sobre" description="Uma breve descrição" />
                <Field label="Biografia">
                  <Textarea
                    value={formData.bio || ""}
                    onChange={(e) => set("bio", e.target.value)}
                    rows={3}
                    disabled={loading}
                    placeholder="Resumo profissional, especialidades, interesses..."
                  />
                </Field>
              </div>
            </>
          )}

          {/* ── Aba: Trabalho ── */}
          {activeTab === "trabalho" && (
            <>
              <SectionHeader
                icon={Briefcase}
                title="Cargo & Departamento"
                description="Posição na empresa"
              />
              <div className="grid-2" style={{ marginBottom: 24 }}>
                <Field label="Cargo">
                  <Input
                    type="text"
                    value={formData.job_title || ""}
                    onChange={(e) => set("job_title", e.target.value)}
                    disabled={loading}
                    placeholder="Ex: Engenheiro de Saneamento"
                  />
                </Field>
                <Field label="Departamento">
                  <Input
                    type="text"
                    value={formData.department || ""}
                    onChange={(e) => set("department", e.target.value)}
                    disabled={loading}
                    placeholder="Ex: Engenharia"
                  />
                </Field>
              </div>

              <SectionHeader icon={MapPin} title="Localização" description="Onde a pessoa fica no escritório" />
              <Field label="Andar" className="mb-6">
                <Input
                  type="number"
                  min={0}
                  value={formData.floor_number ?? ""}
                  onChange={(e) => set("floor_number", e.target.value ? Number(e.target.value) : null)}
                  disabled={loading}
                  placeholder="Ex: 3"
                />
              </Field>

              <SectionHeader
                icon={Clock}
                title="Disponibilidade"
                description="Status atual e horário de trabalho"
              />
              <Field label="Status">
                <Select
                  value={formData.availability_status || ""}
                  onChange={(e) => set("availability_status", (e.target.value || null) as UserProfileUpdate["availability_status"] | null)}
                  disabled={loading}
                >
                  <option value="">Sem status definido</option>
                  {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
              {formData.availability_status && (
                <div className="flex items-center gap-2 mt-2 mb-4">
                  <div
                    style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: AVAILABILITY_COLORS[formData.availability_status],
                    }}
                  />
                  <span className="text-xs text-muted">
                    Visualização: <strong style={{ color: "var(--foreground)" }}>{AVAILABILITY_LABELS[formData.availability_status]}</strong>
                  </span>
                </div>
              )}
              <div className="grid-2" style={{ marginTop: 12 }}>
                <Field label="Horário de início">
                  <Input
                    type="time"
                    value={formData.work_start_time || ""}
                    onChange={(e) => set("work_start_time", e.target.value)}
                    disabled={loading}
                  />
                </Field>
                <Field label="Horário de fim">
                  <Input
                    type="time"
                    value={formData.work_end_time || ""}
                    onChange={(e) => set("work_end_time", e.target.value)}
                    disabled={loading}
                  />
                </Field>
              </div>
            </>
          )}

          {/* ── Aba: Acesso (apenas para quem pode atribuir roles) ── */}
          {activeTab === "acesso" && canEditRole && (
            <>
              <SectionHeader
                icon={Shield}
                title="Nível de acesso"
                description="Permissões e papel da pessoa na plataforma"
              />
              <Field label="Papel" className="mb-6">
                <Select
                  value={formData.role ?? profile.role}
                  onChange={(e) => set("role", e.target.value)}
                  disabled={loading}
                >
                  {USER_ROLE_ASSIGN_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABELS[value] || value}
                    </option>
                  ))}
                </Select>
              </Field>

              <SectionHeader
                icon={isActive ? CheckCircle2 : XCircle}
                title="Status da conta"
                description="Conta inativa não consegue acessar a plataforma"
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => set("is_active", true)}
                  disabled={loading}
                  style={{
                    padding: "16px 14px",
                    borderRadius: "var(--radius-md)",
                    border: `2px solid ${isActive ? "var(--success)" : "var(--border)"}`,
                    background: isActive ? "var(--success-soft)" : "var(--surface)",
                    color: isActive ? "var(--success-fg)" : "var(--muted-fg)",
                    textAlign: "left",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={16} />
                    <strong className="text-sm">Ativo</strong>
                  </div>
                  <p className="text-xs" style={{ lineHeight: 1.4 }}>
                    Pode fazer login e acessar a plataforma normalmente.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => set("is_active", false)}
                  disabled={loading}
                  style={{
                    padding: "16px 14px",
                    borderRadius: "var(--radius-md)",
                    border: `2px solid ${!isActive ? "var(--danger)" : "var(--border)"}`,
                    background: !isActive ? "var(--danger-soft)" : "var(--surface)",
                    color: !isActive ? "var(--danger-fg)" : "var(--muted-fg)",
                    textAlign: "left",
                    cursor: loading ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle size={16} />
                    <strong className="text-sm">Inativo</strong>
                  </div>
                  <p className="text-xs" style={{ lineHeight: 1.4 }}>
                    Não consegue fazer login. Histórico fica preservado.
                  </p>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer fixo */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            background: "var(--surface-2)",
          }}
        >
          <div className="text-xs text-muted">
            {profile.updated_at && (
              <span>Última atualização: {new Date(profile.updated_at).toLocaleDateString("pt-BR")}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={loading} disabled={loading || uploadingPhoto}>
              Salvar alterações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
