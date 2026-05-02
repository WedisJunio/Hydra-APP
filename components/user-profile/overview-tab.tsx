"use client";

import type { UserProfile } from "@/lib/user-profile/types";
import { ContactCard } from "./contact-card";
import { AvailabilityCard } from "./availability-card";

export function OverviewTab({ profile }: { profile: UserProfile }) {
  return (
    <div className="space-y-4">
      {profile.bio && (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
          }}
        >
          <h3 className="font-semibold mb-3">Sobre</h3>
          <p className="text-sm text-muted leading-relaxed">{profile.bio}</p>
        </div>
      )}
      <ContactCard profile={profile} />
      <AvailabilityCard profile={profile} />
    </div>
  );
}
