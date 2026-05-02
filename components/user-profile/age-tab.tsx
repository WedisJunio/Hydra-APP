"use client";

import type { UserProfile } from "@/lib/user-profile/types";
import {
  calculateAge,
  getNextBirthday,
} from "@/lib/user-profile/data";
import { formatDate } from "@/lib/utils";
import { Cake, Calendar } from "lucide-react";

export function AgeTab({ profile }: { profile: UserProfile }) {
  if (!profile.date_of_birth) {
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
        <p className="text-sm text-muted">Data de nascimento não informada</p>
      </div>
    );
  }

  const age = calculateAge(profile.date_of_birth);
  const nextBirthday = getNextBirthday(profile.date_of_birth);

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
        <h3 className="font-semibold mb-4">Idade e Aniversário</h3>
        <div className="space-y-4">
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 12,
            }}
          >
            <div className="text-xs text-muted mb-2 flex items-center gap-2">
              <Cake size={14} />
              Idade atual
            </div>
            <p className="text-3xl font-bold text-primary">{age} anos</p>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 12,
            }}
          >
            <div className="text-xs text-muted mb-2 flex items-center gap-2">
              <Calendar size={14} />
              Data de nascimento
            </div>
            <p className="text-sm font-medium">
              {formatDate(profile.date_of_birth)}
            </p>
          </div>

          {nextBirthday && (
            <div
              style={{
                background: "var(--warning-soft)",
                border: "1px solid var(--warning)",
                borderRadius: "var(--radius-md)",
                padding: 12,
              }}
            >
              <div className="text-xs text-warning-fg mb-2 flex items-center gap-2">
                <Cake size={14} />
                Próximo aniversário
              </div>
              <p className="text-sm font-medium text-warning-fg">
                {formatDate(nextBirthday)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
