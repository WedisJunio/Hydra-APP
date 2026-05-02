import * as React from "react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  icon,
  trend,
  trendVariant,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  trend?: React.ReactNode;
  trendVariant?: "up" | "down" | "neutral";
  className?: string;
}) {
  const trendColor =
    trendVariant === "up"
      ? "var(--success)"
      : trendVariant === "down"
      ? "var(--danger)"
      : "var(--muted-fg)";
  return (
    <div className={cn("stat", className)}>
      {icon && <div className="stat-icon">{icon}</div>}
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {trend && (
        <div className="stat-trend" style={{ color: trendColor }}>
          {trend}
        </div>
      )}
    </div>
  );
}

export function StatsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid-stats">{children}</div>;
}
