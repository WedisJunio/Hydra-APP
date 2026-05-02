"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getUserProfile, getColleaguesByDepartment, getColleaguesByFloor, calculateAge, getNextBirthday } from "@/lib/user-profile/data";
import type { UserProfile } from "@/lib/user-profile/types";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, ROLE_LABELS } from "@/lib/user-profile/types";
import { EditProfileModal } from "@/components/user-profile/edit-profile-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft, Pencil, Mail, Phone, MapPin, Linkedin,
  Briefcase, Building2, Clock, Cake, Calendar, Users,
} from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
      }}
    >
      <h3 className="font-semibold mb-3 text-sm text-muted uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, href, isExternal }: {
  icon: React.ElementType;
  label: string;
  value: string | number | null | undefined;
  href?: string;
  isExternal?: boolean;
}) {
  if (!value) return null;
  const content = (
    <div className="flex items-center gap-3 py-1">
      <Icon size={15} className="text-muted flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-sm break-all">{value}</div>
      </div>
    </div>
  );
  if (href) {
    return (
      <a href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} className="block hover:opacity-75 transition-opacity">
        {content}
      </a>
    );
  }
  return content;
}

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [floorColleagues, setFloorColleagues] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);

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

  if (loading) {
    return (
      <div className="container max-w-2xl py-6 space-y-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-28 w-full" />
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container max-w-2xl py-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} leftIcon={<ArrowLeft size={14} />} className="mb-4">
          Voltar
        </Button>
        <p className="text-center text-muted">Perfil não encontrado</p>
      </div>
    );
  }

  const age = calculateAge(profile.date_of_birth);
  const nextBirthday = getNextBirthday(profile.date_of_birth);
  const deptColleagues = colleagues.filter(c => c.id !== profile.id);
  const floorPeers = floorColleagues.filter(c => c.id !== profile.id);

  return (
    <div className="container max-w-2xl py-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} leftIcon={<ArrowLeft size={14} />}>
          Voltar
        </Button>
        <Button variant="secondary" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setEditModalOpen(true)}>
          Editar Perfil
        </Button>
      </div>

      {/* Hero */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div className="flex items-start gap-4">
          <Avatar
            name={profile.name}
            src={profile.photo_url}
            size="xl"
            style={{ width: 72, height: 72, borderRadius: "var(--radius-lg)", flexShrink: 0 }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-bold">{profile.name}</h1>
              {profile.availability_status && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: AVAILABILITY_COLORS[profile.availability_status],
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
            {profile.job_title && <p className="text-sm text-muted mb-1">{profile.job_title}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              {profile.department && (
                <div className="flex items-center gap-1">
                  <Building2 size={13} className="text-muted" />
                  <span className="text-xs text-muted">{profile.department}</span>
                </div>
              )}
              {profile.role && (
                <Badge variant="neutral">{ROLE_LABELS[profile.role] || profile.role}</Badge>
              )}
            </div>
          </div>
        </div>
        {profile.bio && (
          <p className="text-sm text-muted mt-3 leading-relaxed">{profile.bio}</p>
        )}
      </div>

      <div className="space-y-3">
        {/* Informações */}
        {(profile.date_of_birth || profile.phone || profile.created_at) && (
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}
          >
            {profile.phone && (
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: 14,
                }}
              >
                <div className="text-xs text-muted mb-1 flex items-center gap-1">
                  <Phone size={12} /> Telefone
                </div>
                <div className="text-sm font-semibold">{profile.phone}</div>
              </div>
            )}
            {profile.date_of_birth && (
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: 14,
                }}
              >
                <div className="text-xs text-muted mb-1 flex items-center gap-1">
                  <Cake size={12} /> Nascimento
                </div>
                <div className="text-sm font-semibold">{formatDate(profile.date_of_birth)}</div>
                {age !== null && (
                  <div className="text-xs text-muted mt-0.5">{age} anos</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Contato */}
        {(profile.email || profile.phone || profile.address || profile.linkedin_url) && (
          <Section title="Contato">
            <div className="space-y-1">
              <InfoRow icon={Mail} label="Email" value={profile.email} href={`mailto:${profile.email}`} />
              <InfoRow icon={Phone} label="Telefone" value={profile.phone} href={`tel:${profile.phone}`} />
              <InfoRow icon={MapPin} label="Endereço" value={profile.address} />
              <InfoRow
                icon={Linkedin}
                label="LinkedIn"
                value={profile.linkedin_url?.replace(/^https?:\/\/(www\.)?/, "") || null}
                href={profile.linkedin_url}
                isExternal
              />
            </div>
          </Section>
        )}

        {/* Disponibilidade */}
        {(profile.availability_status || profile.work_start_time) && (
          <Section title="Disponibilidade">
            <div className="space-y-2">
              {profile.availability_status && (
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: AVAILABILITY_COLORS[profile.availability_status],
                    }}
                  />
                  <span className="text-sm font-medium">
                    {AVAILABILITY_LABELS[profile.availability_status]}
                  </span>
                </div>
              )}
              {profile.work_start_time && profile.work_end_time && (
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-muted" />
                  <span className="text-sm">{profile.work_start_time} – {profile.work_end_time}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Cargo */}
        {(profile.job_title || profile.department || profile.role) && (
          <Section title="Cargo">
            <div className="space-y-2">
              <InfoRow icon={Briefcase} label="Cargo" value={profile.job_title} />
              <InfoRow icon={Building2} label="Departamento" value={profile.department} />
              {profile.role && (
                <div className="flex items-center gap-3 py-1">
                  <Users size={15} className="text-muted flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted">Nível</div>
                    <Badge variant="neutral">{ROLE_LABELS[profile.role] || profile.role}</Badge>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Idade */}
        {profile.date_of_birth && (
          <Section title="Aniversário">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Cake size={15} className="text-muted" />
                <div>
                  <div className="text-xs text-muted">Data de nascimento</div>
                  <div className="text-sm">{formatDate(profile.date_of_birth)}</div>
                </div>
              </div>
              {age !== null && (
                <div className="flex items-center gap-3">
                  <Calendar size={15} className="text-muted" />
                  <div>
                    <div className="text-xs text-muted">Idade</div>
                    <div className="text-sm font-medium">{age} anos</div>
                  </div>
                </div>
              )}
              {nextBirthday && (
                <div
                  className="flex items-center gap-2 mt-1 px-2 py-1 rounded"
                  style={{ background: "var(--warning-soft)", color: "var(--warning-fg)" }}
                >
                  <Cake size={13} />
                  <span className="text-xs font-medium">Próximo aniversário: {formatDate(nextBirthday)}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Localização */}
        {profile.floor_number && (
          <Section title="Localização">
            <div className="flex items-center gap-3 mb-3">
              <Building2 size={15} className="text-muted" />
              <div>
                <div className="text-xs text-muted">Andar</div>
                <div className="text-sm font-medium">{profile.floor_number}º andar</div>
              </div>
            </div>
            {floorPeers.length > 0 && (
              <div>
                <p className="text-xs text-muted mb-2">Colegas no mesmo andar ({floorPeers.length})</p>
                <div className="flex flex-wrap gap-2">
                  {floorPeers.slice(0, 6).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <Avatar name={c.name} src={c.photo_url} size="xs" />
                      <span className="text-xs">{c.name}</span>
                    </div>
                  ))}
                  {floorPeers.length > 6 && (
                    <span className="text-xs text-muted self-center">+{floorPeers.length - 6} mais</span>
                  )}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Departamento */}
        {profile.department && deptColleagues.length > 0 && (
          <Section title="Equipe">
            <p className="text-xs text-muted mb-2">{profile.department} · {deptColleagues.length + 1} membros</p>
            <div className="space-y-2">
              {deptColleagues.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <Avatar name={c.name} src={c.photo_url} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    {c.job_title && <div className="text-xs text-muted truncate">{c.job_title}</div>}
                  </div>
                </div>
              ))}
              {deptColleagues.length > 5 && (
                <p className="text-xs text-muted">+{deptColleagues.length - 5} mais</p>
              )}
            </div>
          </Section>
        )}

      </div>

      <EditProfileModal
        profile={profile}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={(updated) => setProfile(updated)}
      />
    </div>
  );
}
