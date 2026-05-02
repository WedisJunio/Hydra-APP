"use client";

import { useEffect, useState } from "react";
import type { UserProfile } from "@/lib/user-profile/types";
import { getColleaguesByDepartment } from "@/lib/user-profile/data";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users } from "lucide-react";

export function DepartmentTab({ profile }: { profile: UserProfile }) {
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile.department) return;

    setLoading(true);
    getColleaguesByDepartment(profile.department).then((data) => {
      setColleagues(data);
      setLoading(false);
    });
  }, [profile.department]);

  if (!profile.department) {
    return (
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 16,
          textAlign: "center",
        }}
      >
        <p className="text-sm text-muted">Departamento não informado</p>
      </div>
    );
  }

  const departmentMembers = colleagues.filter((c) => c.department === profile.department);
  const managers = departmentMembers.filter(
    (c) => c.role === "manager" || c.role === "leader"
  );

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
        <div className="flex items-center gap-3 mb-4">
          <Building2 size={20} className="text-primary" />
          <h3 className="font-semibold text-lg">{profile.department}</h3>
        </div>

        {managers.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted mb-3">Responsáveis</p>
            <div className="space-y-2">
              {managers.map((manager) => (
                <div
                  key={manager.id}
                  className="flex items-center gap-2 p-2 bg-surface rounded"
                >
                  <Avatar
                    src={manager.photo_url}
                    fallback={manager.name.charAt(0).toUpperCase()}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{manager.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 16,
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-muted" />
          <h3 className="font-semibold">
            Membros da equipe ({departmentMembers.length})
          </h3>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : departmentMembers.length === 0 ? (
          <p className="text-sm text-muted">Nenhum membro neste departamento</p>
        ) : (
          <div className="space-y-2">
            {departmentMembers.map((colleague) => (
              <div
                key={colleague.id}
                className="flex items-center gap-3 p-2 hover:bg-surface rounded transition-colors"
              >
                <Avatar
                  src={colleague.photo_url}
                  fallback={colleague.name.charAt(0).toUpperCase()}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {colleague.name}
                  </div>
                  {colleague.job_title && (
                    <div className="text-xs text-muted truncate">
                      {colleague.job_title}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
