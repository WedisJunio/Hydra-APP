"use client";

import type { UserProfile } from "@/lib/user-profile/types";
import { ROLE_LABELS } from "@/lib/user-profile/types";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Briefcase, Building2, Calendar } from "lucide-react";

export function JobDetailsTab({ profile }: { profile: UserProfile }) {
  return (
    <div className="space-y-4">
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 16,
        }}
      >
        <h3 className="font-semibold mb-4">Função</h3>
        <div className="space-y-4">
          {profile.job_title && (
            <div>
              <div className="text-xs text-muted mb-2 flex items-center gap-2">
                <Briefcase size={14} />
                Cargo
              </div>
              <p className="text-sm font-medium">{profile.job_title}</p>
            </div>
          )}

          {profile.department && (
            <div>
              <div className="text-xs text-muted mb-2 flex items-center gap-2">
                <Building2 size={14} />
                Departamento
              </div>
              <p className="text-sm font-medium">{profile.department}</p>
            </div>
          )}

          {profile.role && (
            <div>
              <div className="text-xs text-muted mb-2">Nível</div>
              <Badge variant="neutral">
                {ROLE_LABELS[profile.role] || profile.role}
              </Badge>
            </div>
          )}

          {profile.created_at && (
            <div>
              <div className="text-xs text-muted mb-2 flex items-center gap-2">
                <Calendar size={14} />
                Entrada na empresa
              </div>
              <p className="text-sm">{formatDate(profile.created_at)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
