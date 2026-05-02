"use client";

import type { UserProfile } from "@/lib/user-profile/types";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
} from "@/lib/user-profile/types";
import { Clock } from "lucide-react";
import { isWorkingHours } from "@/lib/user-profile/data";

export function AvailabilityCard({ profile }: { profile: UserProfile }) {
  const hasAvailabilityInfo =
    profile.availability_status ||
    profile.work_start_time ||
    profile.work_end_time;

  if (!hasAvailabilityInfo) return null;

  const working = isWorkingHours(
    profile.work_start_time,
    profile.work_end_time,
    profile.availability_status
  );

  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
      }}
    >
      <h3 className="font-semibold mb-3">Disponibilidade</h3>
      <div className="space-y-4">
        {profile.availability_status && (
          <div>
            <div className="text-xs text-muted mb-2">Status</div>
            <div className="flex items-center gap-2">
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: AVAILABILITY_COLORS[profile.availability_status],
                }}
              />
              <span className="text-sm font-medium">
                {AVAILABILITY_LABELS[profile.availability_status]}
              </span>
            </div>
          </div>
        )}

        {(profile.work_start_time || profile.work_end_time) && (
          <div>
            <div className="text-xs text-muted mb-2">Horário de trabalho</div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-muted" />
              <span className="text-sm">
                {profile.work_start_time} - {profile.work_end_time}
              </span>
            </div>
            {!working && profile.availability_status !== "offline" && (
              <div className="text-xs text-muted mt-1">
                Fora do horário comercial
              </div>
            )}
          </div>
        )}

        {working && (
          <div className="text-xs text-success font-medium">
            ✓ Disponível para conversa
          </div>
        )}
      </div>
    </div>
  );
}
