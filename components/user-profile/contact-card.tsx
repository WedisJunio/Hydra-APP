"use client";

import type { UserProfile } from "@/lib/user-profile/types";
import { Mail, Phone, MapPin, Linkedin } from "lucide-react";

export function ContactCard({ profile }: { profile: UserProfile }) {
  const contacts = [
    {
      icon: Mail,
      label: "Email",
      value: profile.email,
      href: `mailto:${profile.email}`,
    },
    {
      icon: Phone,
      label: "Telefone",
      value: profile.phone,
      href: `tel:${profile.phone}`,
    },
    {
      icon: MapPin,
      label: "Endereço",
      value: profile.address,
    },
    {
      icon: Linkedin,
      label: "LinkedIn",
      value: profile.linkedin_url?.replace(/^https?:\/\/(www\.)?/, "") || null,
      href: profile.linkedin_url,
      isExternal: true,
    },
  ].filter((c) => c.value);

  if (contacts.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
      }}
    >
      <h3 className="font-semibold mb-3">Contato</h3>
      <div className="space-y-3">
        {contacts.map((contact) => {
          const Icon = contact.icon;
          const content = (
            <div className="flex items-center gap-3">
              <Icon size={16} className="text-muted flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-muted">{contact.label}</div>
                <div className="text-sm break-all">{contact.value}</div>
              </div>
            </div>
          );

          if (contact.href) {
            return (
              <a
                key={contact.label}
                href={contact.href}
                target={contact.isExternal ? "_blank" : undefined}
                rel={contact.isExternal ? "noopener noreferrer" : undefined}
                className="block hover:opacity-75 transition-opacity"
              >
                {content}
              </a>
            );
          }

          return <div key={contact.label}>{content}</div>;
        })}
      </div>
    </div>
  );
}
