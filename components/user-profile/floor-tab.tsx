"use client";

import { useEffect, useState } from "react";
import type { UserProfile } from "@/lib/user-profile/types";
import { getColleaguesByFloor } from "@/lib/user-profile/data";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users } from "lucide-react";

export function FloorTab({ profile }: { profile: UserProfile }) {
  const [colleagues, setColleagues] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile.floor_number) return;

    setLoading(true);
    getColleaguesByFloor(profile.floor_number).then((data) => {
      setColleagues(data);
      setLoading(false);
    });
  }, [profile.floor_number]);

  if (!profile.floor_number) {
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
        <p className="text-sm text-muted">Andar não informado</p>
      </div>
    );
  }

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
          <h3 className="font-semibold text-lg">Andar {profile.floor_number}</h3>
        </div>
        {profile.address && (
          <p className="text-sm text-muted mb-4">{profile.address}</p>
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
            Colegas no andar ({colleagues.length})
          </h3>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : colleagues.length === 0 ? (
          <p className="text-sm text-muted">Nenhum colega neste andar</p>
        ) : (
          <div className="space-y-3">
            {colleagues.map((colleague) => (
              <div
                key={colleague.id}
                className="flex items-center gap-3 p-2 hover:bg-surface rounded transition-colors"
              >
                <Avatar
                  name={colleague.name}
                  src={colleague.photo_url}
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
