"use client";

import { useRef, useState } from "react";
import type { UserProfile, UserProfileUpdate } from "@/lib/user-profile/types";
import { updateUserProfile } from "@/lib/user-profile/data";
import { AVAILABILITY_LABELS } from "@/lib/user-profile/types";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Camera, X } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

function inputClass(disabled: boolean) {
  return `w-full px-3 py-2 border border-border rounded-md bg-surface text-sm ${disabled ? "opacity-50 cursor-not-allowed" : ""}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium block mb-1">{children}</label>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-muted uppercase tracking-wide border-b border-border pb-1 mb-3 mt-5">
      {children}
    </div>
  );
}

export function EditProfileModal({
  profile,
  isOpen,
  onClose,
  onSave,
}: {
  profile: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedProfile: UserProfile) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<UserProfileUpdate>({
    full_name: profile.full_name,
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
  });

  function set(field: keyof UserProfileUpdate, value: string | number | null) {
    setFormData((prev) => ({ ...prev, [field]: value || undefined }));
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
    } catch (err) {
      showErrorToast("Erro ao enviar foto. Verifique se o bucket 'avatars' existe no Supabase Storage.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    setLoading(true);
    const result = await updateUserProfile(profile.id, formData);

    if (result.success) {
      showSuccessToast("Perfil atualizado com sucesso");
      onSave({ ...profile, ...formData, updated_at: new Date().toISOString() } as UserProfile);
      onClose();
    } else {
      showErrorToast(result.error || "Erro ao atualizar perfil");
    }
    setLoading(false);
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--background)",
          borderRadius: "var(--radius-lg)",
          padding: 24,
          maxWidth: 520,
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Editar Perfil</h2>
          <Button size="icon-sm" variant="ghost" onClick={onClose} disabled={loading}>
            <X size={16} />
          </Button>
        </div>

        {/* Foto */}
        <div className="flex flex-col items-center mb-2">
          <div style={{ position: "relative", display: "inline-block" }}>
            <Avatar
              name={formData.full_name || profile.name}
              src={formData.photo_url}
              size="xl"
              style={{ width: 90, height: 90, borderRadius: "var(--radius-lg)" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto || loading}
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                background: "var(--primary)",
                color: "#fff",
                border: "2px solid var(--background)",
                borderRadius: "50%",
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Camera size={14} />
            </button>
          </div>
          <span className="text-xs text-muted mt-2">
            {uploadingPhoto ? "Enviando..." : "Clique na câmera para alterar"}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </div>

        {/* Informações Pessoais */}
        <SectionTitle>Informações Pessoais</SectionTitle>
        <div className="space-y-3">
          <div>
            <Label>Nome completo</Label>
            <input type="text" value={formData.full_name || ""} onChange={(e) => set("full_name", e.target.value)} className={inputClass(loading)} disabled={loading} />
          </div>
          <div>
            <Label>Telefone</Label>
            <input type="tel" value={formData.phone || ""} onChange={(e) => set("phone", e.target.value)} className={inputClass(loading)} disabled={loading} placeholder="+55 11 99999-0000" />
          </div>
          <div>
            <Label>Data de nascimento</Label>
            <input type="date" value={formData.date_of_birth || ""} onChange={(e) => set("date_of_birth", e.target.value)} className={inputClass(loading)} disabled={loading} />
          </div>
          <div>
            <Label>Endereço</Label>
            <input type="text" value={formData.address || ""} onChange={(e) => set("address", e.target.value)} className={inputClass(loading)} disabled={loading} />
          </div>
          <div>
            <Label>Biografia</Label>
            <textarea value={formData.bio || ""} onChange={(e) => set("bio", e.target.value)} className={inputClass(loading)} rows={3} disabled={loading} style={{ resize: "none" }} />
          </div>
        </div>

        {/* Trabalho */}
        <SectionTitle>Trabalho</SectionTitle>
        <div className="space-y-3">
          <div>
            <Label>Andar</Label>
            <input type="number" value={formData.floor_number || ""} onChange={(e) => set("floor_number", e.target.value ? Number(e.target.value) : null)} className={inputClass(loading)} disabled={loading} />
          </div>
          <div>
            <Label>LinkedIn</Label>
            <input type="url" value={formData.linkedin_url || ""} onChange={(e) => set("linkedin_url", e.target.value)} className={inputClass(loading)} disabled={loading} placeholder="https://linkedin.com/in/..." />
          </div>
        </div>

        {/* Disponibilidade */}
        <SectionTitle>Disponibilidade</SectionTitle>
        <div className="space-y-3">
          <div>
            <Label>Status</Label>
            <select value={formData.availability_status || ""} onChange={(e) => set("availability_status", e.target.value)} className={inputClass(loading)} disabled={loading}>
              <option value="">Sem status</option>
              {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Horário início</Label>
              <input type="time" value={formData.work_start_time || ""} onChange={(e) => set("work_start_time", e.target.value)} className={inputClass(loading)} disabled={loading} />
            </div>
            <div>
              <Label>Horário fim</Label>
              <input type="time" value={formData.work_end_time || ""} onChange={(e) => set("work_end_time", e.target.value)} className={inputClass(loading)} disabled={loading} />
            </div>
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-2 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || uploadingPhoto} className="flex-1">
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
