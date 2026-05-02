"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { UserProfile } from "@/lib/user-profile/types";
import { ROLE_LABELS, AVAILABILITY_COLORS } from "@/lib/user-profile/types";
import { Mail, Building2 } from "lucide-react";

export function ProfileHeader({ profile }: { profile: UserProfile }) {
  return (
    <div className="mb-6">
      <div className="flex items-start gap-4 mb-4">
        <Avatar
          name={profile.name}
          src={profile.photo_url}
          size="xl"
          style={{
            width: 120,
            height: 120,
            borderRadius: "var(--radius-lg)",
          }}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h1 className="text-2xl font-bold">{profile.name}</h1>
            {profile.availability_status && (
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: AVAILABILITY_COLORS[profile.availability_status],
                }}
                title={profile.availability_status}
              />
            )}
          </div>
          {profile.job_title && (
            <p className="text-lg text-muted mb-2">{profile.job_title}</p>
          )}
          {profile.department && (
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={16} className="text-muted" />
              <span className="text-sm text-muted">{profile.department}</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {profile.email && (
              <div className="flex items-center gap-1">
                <Mail size={14} className="text-muted" />
                <span className="text-sm">{profile.email}</span>
              </div>
            )}
            {profile.role && (
              <Badge variant="neutral">
                {ROLE_LABELS[profile.role] || profile.role}
              </Badge>
            )}
          </div>
        </div>
      </div>
      {profile.bio && (
        <div className="text-sm text-muted leading-relaxed">
          {profile.bio}
        </div>
      )}
    </div>
  );
}
