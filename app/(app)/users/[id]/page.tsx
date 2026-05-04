"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getUserProfile,
  getColleaguesByDepartment,
  getColleaguesByFloor,
  calculateAge,
  getNextBirthday,
  isWorkingHours,
} from "@/lib/user-profile/data";
import type { UserProfile } from "@/lib/user-profile/types";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  ROLE_LABELS,
} from "@/lib/user-profile/types";
import { EditProfileModal } from "@/components/user-profile/edit-profile-modal";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { canAssignUserRoles } from "@/lib/permissions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Briefcase,
  Building2,
  Clock,
  Cake,
  Calendar,
  Users,
  Shield,
  Activity,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Crown,
  CalendarDays,
} from "lucide-react";

// ─── Helpers visuais ─────────────────────────────────────────────────────────

function getRoleVariant(role: string): "primary" | "info" | "neutral" | "warning" {
  if (role === "admin") return "warning";
  if (role === "manager" || role === "coordinator") return "primary";
  if (role === "leader" || role === "projetista_lider") return "info";
  return "neutral";
}

function yearsAtCompany(createdAt: string | undefined | null): number | null {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const m = now.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < start.getDate())) years--;
  return Math.max(years, 0);
}

function monthsAtCompany(createdAt: string | undefined | null): number | null {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  hint,
  icon,
  variant = "primary",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "info" | "purple";
}) {
  const colorMap = {
    primary: "var(--primary)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    info: "var(--info)",
    purple: "#7C3AED",
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
            width: 32,
            height: 32,
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
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
          lineHeight: 1.2,
          marginTop: 2,
        }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-xs text-muted" style={{ marginTop: 1, fontWeight: 500 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  accentColor = "var(--primary)",
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: "var(--surface-2)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: `color-mix(in srgb, ${accentColor} 15%, transparent)`,
              color: accentColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={14} />
          </div>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "0.01em",
              textTransform: "uppercase",
              color: "var(--foreground)",
            }}
          >
            {title}
          </h3>
        </div>
        {action}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
  href,
  isExternal,
  copyable,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number | null | undefined;
  href?: string;
  isExternal?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const content = (
    <div className="flex items-center gap-3 py-2" style={{ borderRadius: 8 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "var(--surface-2)",
          color: "var(--muted-fg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted" style={{ fontWeight: 500 }}>{label}</div>
        <div
          className="text-sm"
          style={{
            color: "var(--foreground)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? "Copiado!" : "Copiar"}
          style={{
            border: "1px solid var(--border)",
            background: "transparent",
            borderRadius: 6,
            width: 26,
            height: 26,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: copied ? "var(--success)" : "var(--muted-fg)",
            flexShrink: 0,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      )}
      {isExternal && (
        <ExternalLink size={11} className="text-muted" style={{ flexShrink: 0 }} />
      )}
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="block transition-colors"
        style={{ display: "block" }}
        onMouseEnter={(e) => {
          (e.currentTarget.firstChild as HTMLElement).style.background = "var(--surface-2)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget.firstChild as HTMLElement).style.background = "transparent";
        }}
      >
        {content}
      </a>
    );
  }
  return content;
}

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
  href,
  isExternal,
  variant = "default",
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  href?: string;
  isExternal?: boolean;
  variant?: "default" | "primary";
}) {
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 8,
    border: variant === "primary" ? "none" : "1px solid var(--border)",
    background: variant === "primary" ? "var(--primary)" : "var(--surface)",
    color: variant === "primary" ? "#fff" : "var(--foreground)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.12s",
    textDecoration: "none",
    whiteSpace: "nowrap",
  };

  const inner = (
    <>
      <Icon size={13} />
      {label}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        style={baseStyle}
        onMouseEnter={(e) => {
          if (variant !== "primary") {
            e.currentTarget.style.borderColor = "var(--primary)";
            e.currentTarget.style.color = "var(--primary)";
          }
        }}
        onMouseLeave={(e) => {
          if (variant !== "primary") {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--foreground)";
          }
        }}
      >
        {inner}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} style={baseStyle}>
      {inner}
    </button>
  );
}

function ColleagueChip({ user, onClick }: { user: UserProfile; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px 6px 6px",
        borderRadius: 999,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        transition: "all 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.background = "var(--primary-soft)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background = "var(--surface-2)";
      }}
    >
      <Avatar name={user.name} src={user.photo_url} size="xs" />
      <span className="text-xs font-medium truncate" style={{ maxWidth: 120 }}>
        {user.name}
      </span>
    </button>
  );
}

// ─── Página principal ───────────────────────────────────────────────────────

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [floorColleagues, setFloorColleagues] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewer, setViewer] = useState<{ id: string; role: string | null } | null>(null);

  useEffect(() => {
    getCurrentProfile().then((p) => {
      if (p) setViewer({ id: p.id, role: p.role ?? null });
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const data = await getUserProfile(userId);
        if (data) {
          setProfile(data);
          if (data.department) {
            getColleaguesByDepartment(data.department).then(setColleagues);
          }
          if (data.floor_number) {
            getColleaguesByFloor(data.floor_number).then(setFloorColleagues);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const age = useMemo(() => calculateAge(profile?.date_of_birth), [profile?.date_of_birth]);
  const nextBirthday = useMemo(() => getNextBirthday(profile?.date_of_birth), [profile?.date_of_birth]);
  const tenureYears = useMemo(() => yearsAtCompany(profile?.created_at), [profile?.created_at]);
  const tenureMonths = useMemo(() => monthsAtCompany(profile?.created_at), [profile?.created_at]);
  const isWorking = useMemo(
    () => isWorkingHours(profile?.work_start_time, profile?.work_end_time, profile?.availability_status),
    [profile?.work_start_time, profile?.work_end_time, profile?.availability_status]
  );

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Skeleton style={{ height: 32, width: 100, marginBottom: 16 }} />
        <Skeleton style={{ height: 160, marginBottom: 16 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 90 }} />
          ))}
        </div>
        <div className="grid-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 200 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          leftIcon={<ArrowLeft size={14} />}
          className="mb-4"
        >
          Voltar
        </Button>
        <p className="text-center text-muted">Perfil não encontrado</p>
      </div>
    );
  }

  const deptColleagues = colleagues.filter((c) => c.id !== profile.id);
  const floorPeers = floorColleagues.filter((c) => c.id !== profile.id);
  const canOpenEdit =
    viewer != null && (viewer.id === profile.id || canAssignUserRoles(viewer.role));
  const isMe = viewer?.id === profile.id;
  const status = profile.availability_status;
  const statusLabel = status ? AVAILABILITY_LABELS[status] : "Sem status";
  const statusColor = status ? AVAILABILITY_COLORS[status] : "var(--muted-fg)";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          leftIcon={<ArrowLeft size={14} />}
        >
          Voltar
        </Button>
        {canOpenEdit && (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Pencil size={14} />}
            onClick={() => setEditModalOpen(true)}
          >
            {isMe ? "Editar meu perfil" : "Editar perfil"}
          </Button>
        )}
      </div>

      {/* ─── Hero premium ─── */}
      <div
        style={{
          position: "relative",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: 0,
          marginBottom: 16,
          overflow: "hidden",
          boxShadow: "var(--shadow-md)",
        }}
      >
        {/* Faixa decorativa superior */}
        <div
          style={{
            height: 90,
            background:
              "linear-gradient(135deg, var(--primary-soft) 0%, color-mix(in srgb, var(--primary) 8%, transparent) 50%, transparent 100%)",
            borderBottom: "1px solid var(--border)",
            position: "relative",
          }}
        >
          {/* Pattern sutil */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 80% 50%, color-mix(in srgb, var(--primary) 20%, transparent) 0%, transparent 60%)",
              opacity: 0.5,
            }}
          />
        </div>

        <div style={{ padding: "0 24px 20px", position: "relative" }}>
          {/* Avatar (sobrepõe a faixa) */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 18,
              marginTop: -50,
              flexWrap: "wrap",
            }}
          >
            <div style={{ position: "relative" }}>
              <Avatar
                name={profile.name}
                src={profile.photo_url}
                size="xl"
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: "var(--radius-lg)",
                  border: "4px solid var(--surface)",
                  boxShadow: "var(--shadow-md)",
                }}
              />
              {status && (
                <div
                  title={statusLabel}
                  style={{
                    position: "absolute",
                    bottom: 6,
                    right: 6,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: statusColor,
                    border: "3px solid var(--surface)",
                  }}
                />
              )}
            </div>

            <div className="flex-1 min-w-0" style={{ paddingBottom: 4 }}>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
                <h1
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {profile.full_name || profile.name}
                </h1>
                <Badge variant={getRoleVariant(profile.role)}>
                  {profile.role === "admin" && <Crown size={11} style={{ marginRight: 4 }} />}
                  {ROLE_LABELS[profile.role] || profile.role}
                </Badge>
                {isMe && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "var(--primary)",
                      color: "#fff",
                      letterSpacing: "0.04em",
                    }}
                  >
                    VOCÊ
                  </span>
                )}
              </div>

              {profile.job_title && (
                <p className="text-sm" style={{ color: "var(--foreground)", fontWeight: 500, margin: 0 }}>
                  {profile.job_title}
                </p>
              )}

              <div
                className="flex items-center gap-3 flex-wrap"
                style={{ marginTop: 8, color: "var(--muted-fg)", fontSize: 13 }}
              >
                {profile.department && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 size={13} />
                    {profile.department}
                  </span>
                )}
                {profile.floor_number != null && (
                  <>
                    <span style={{ opacity: 0.4 }}>•</span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={13} />
                      {profile.floor_number}º andar
                    </span>
                  </>
                )}
                {status && (
                  <>
                    <span style={{ opacity: 0.4 }}>•</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: statusColor,
                          display: "inline-block",
                        }}
                      />
                      {statusLabel}
                      {isWorking && (
                        <span
                          style={{
                            color: "var(--success)",
                            fontWeight: 600,
                            fontSize: 11,
                            marginLeft: 4,
                          }}
                        >
                          • em horário
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Bio (se houver) */}
          {profile.bio && (
            <p
              className="text-sm"
              style={{
                color: "var(--muted-fg)",
                lineHeight: 1.55,
                marginTop: 16,
                borderLeft: "3px solid var(--primary-soft)",
                paddingLeft: 12,
              }}
            >
              {profile.bio}
            </p>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 16 }}>
            {profile.email && (
              <QuickActionButton
                icon={Mail}
                label="Enviar e-mail"
                href={`mailto:${profile.email}`}
                variant="primary"
              />
            )}
            {profile.phone && (
              <QuickActionButton icon={Phone} label="Ligar" href={`tel:${profile.phone}`} />
            )}
            {profile.linkedin_url && (
              <QuickActionButton
                icon={Linkedin}
                label="LinkedIn"
                href={profile.linkedin_url}
                isExternal
              />
            )}
          </div>
        </div>
      </div>

      {/* ─── Stats tiles ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {age !== null && (
          <StatTile
            label="Idade"
            value={`${age}`}
            hint="anos"
            icon={<Cake size={15} />}
            variant="purple"
          />
        )}
        {tenureYears !== null && tenureMonths !== null && (
          <StatTile
            label="Na empresa"
            value={
              tenureYears > 0
                ? `${tenureYears} ${tenureYears === 1 ? "ano" : "anos"}`
                : `${tenureMonths} ${tenureMonths === 1 ? "mês" : "meses"}`
            }
            hint={`desde ${formatDate(profile.created_at.slice(0, 10))}`}
            icon={<CalendarDays size={15} />}
            variant="info"
          />
        )}
        {profile.floor_number != null && (
          <StatTile
            label="Localização"
            value={`${profile.floor_number}º`}
            hint="andar"
            icon={<MapPin size={15} />}
            variant="primary"
          />
        )}
        <StatTile
          label="Status"
          value={statusLabel}
          hint={isWorking ? "em horário de trabalho" : "fora do expediente"}
          icon={<Activity size={15} />}
          variant={status === "available" ? "success" : status === "busy" ? "warning" : "info"}
        />
      </div>

      {/* ─── Grid de seções (2 colunas em desktop) ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14,
        }}
      >
        {/* Contato */}
        <SectionCard title="Contato" icon={Mail} accentColor="var(--primary)">
          <div className="flex flex-col">
            <InfoLine
              icon={Mail}
              label="E-mail"
              value={profile.email}
              href={`mailto:${profile.email}`}
              copyable
            />
            <InfoLine
              icon={Phone}
              label="Telefone"
              value={profile.phone}
              href={profile.phone ? `tel:${profile.phone}` : undefined}
              copyable
            />
            <InfoLine icon={MapPin} label="Endereço" value={profile.address} copyable />
            <InfoLine
              icon={Linkedin}
              label="LinkedIn"
              value={profile.linkedin_url?.replace(/^https?:\/\/(www\.)?/, "") || null}
              href={profile.linkedin_url}
              isExternal
            />
            {!profile.phone && !profile.address && !profile.linkedin_url && (
              <p className="text-xs text-muted" style={{ paddingLeft: 4 }}>
                Apenas e-mail cadastrado.
              </p>
            )}
          </div>
        </SectionCard>

        {/* Cargo & papel */}
        <SectionCard title="Cargo & Papel" icon={Briefcase} accentColor="var(--info)">
          <div className="flex flex-col">
            <InfoLine icon={Briefcase} label="Cargo" value={profile.job_title} />
            <InfoLine icon={Building2} label="Departamento" value={profile.department} />
            <div className="flex items-center gap-3 py-2">
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "var(--surface-2)",
                  color: "var(--muted-fg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Shield size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted" style={{ fontWeight: 500 }}>Nível de acesso</div>
                <div style={{ marginTop: 2 }}>
                  <Badge variant={getRoleVariant(profile.role)}>
                    {ROLE_LABELS[profile.role] || profile.role}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Disponibilidade */}
        <SectionCard
          title="Disponibilidade"
          icon={Activity}
          accentColor={statusColor}
          action={
            isWorking ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "var(--success-soft)",
                  color: "var(--success-fg)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Em horário
              </span>
            ) : null
          }
        >
          <div className="flex flex-col gap-3">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: `color-mix(in srgb, ${statusColor} 8%, transparent)`,
                border: `1px solid color-mix(in srgb, ${statusColor} 30%, transparent)`,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: statusColor,
                  flexShrink: 0,
                  boxShadow: `0 0 0 4px color-mix(in srgb, ${statusColor} 25%, transparent)`,
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{statusLabel}</div>
                {profile.work_start_time && profile.work_end_time && (
                  <div className="text-xs text-muted">
                    Trabalha das {profile.work_start_time} às {profile.work_end_time}
                  </div>
                )}
              </div>
            </div>

            {profile.work_start_time && profile.work_end_time ? (
              <InfoLine
                icon={Clock}
                label="Horário de trabalho"
                value={`${profile.work_start_time} – ${profile.work_end_time}`}
              />
            ) : (
              <p className="text-xs text-muted" style={{ paddingLeft: 4 }}>
                Horário de trabalho não definido.
              </p>
            )}
          </div>
        </SectionCard>

        {/* Aniversário */}
        {profile.date_of_birth && (
          <SectionCard title="Aniversário" icon={Cake} accentColor="#7C3AED">
            <div className="flex flex-col gap-2">
              <InfoLine
                icon={Cake}
                label="Data de nascimento"
                value={formatDate(profile.date_of_birth)}
              />
              {age !== null && (
                <InfoLine icon={Calendar} label="Idade atual" value={`${age} anos`} />
              )}
              {nextBirthday && (
                <div
                  className="flex items-center gap-2 mt-1"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "var(--warning-soft)",
                    color: "var(--warning-fg)",
                  }}
                >
                  <Sparkles size={14} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">Próximo aniversário</div>
                    <div className="text-sm" style={{ fontWeight: 600 }}>
                      {formatDate(nextBirthday)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* Localização (andar + colegas) */}
        {profile.floor_number != null && (
          <SectionCard
            title={`${profile.floor_number}º andar`}
            icon={MapPin}
            accentColor="var(--primary)"
            action={
              floorPeers.length > 0 ? (
                <span className="text-xs text-muted">
                  {floorPeers.length} colega{floorPeers.length > 1 ? "s" : ""}
                </span>
              ) : null
            }
          >
            {floorPeers.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {floorPeers.slice(0, 8).map((c) => (
                  <ColleagueChip
                    key={c.id}
                    user={c}
                    onClick={() => router.push(`/users/${c.id}`)}
                  />
                ))}
                {floorPeers.length > 8 && (
                  <span
                    className="text-xs text-muted self-center"
                    style={{ marginLeft: 6 }}
                  >
                    +{floorPeers.length - 8} mais
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">Esta pessoa é a única cadastrada neste andar.</p>
            )}
          </SectionCard>
        )}
      </div>

      {/* ─── Equipe do departamento (full width) ─── */}
      {profile.department && deptColleagues.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <SectionCard
            title={`Equipe — ${profile.department}`}
            icon={Users}
            accentColor="var(--success)"
            action={
              <span className="text-xs text-muted">
                {deptColleagues.length + 1} membro{deptColleagues.length > 0 ? "s" : ""}
              </span>
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 8,
              }}
            >
              {deptColleagues.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/users/${c.id}`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: 10,
                    borderRadius: 10,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    textAlign: "left",
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.background = "var(--surface)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--surface-2)";
                  }}
                >
                  <Avatar name={c.name} src={c.photo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--foreground)" }}
                    >
                      {c.name}
                    </div>
                    {c.job_title && (
                      <div className="text-xs text-muted truncate">{c.job_title}</div>
                    )}
                  </div>
                  {c.availability_status && (
                    <div
                      title={AVAILABILITY_LABELS[c.availability_status]}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: AVAILABILITY_COLORS[c.availability_status],
                        flexShrink: 0,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      <EditProfileModal
        profile={profile}
        viewerRole={viewer?.role ?? null}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={(updated) => setProfile(updated)}
      />
    </div>
  );
}
