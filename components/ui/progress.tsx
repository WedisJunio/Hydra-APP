import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "success" | "warning" | "danger";

export function Progress({
  value,
  variant = "primary",
  className,
  showLabel = false,
  label,
}: {
  value: number;
  variant?: Variant;
  className?: string;
  showLabel?: boolean;
  label?: React.ReactNode;
}) {
  const v = Math.min(Math.max(value, 0), 100);
  const barClass =
    variant === "success"
      ? "progress-bar-success"
      : variant === "warning"
      ? "progress-bar-warning"
      : variant === "danger"
      ? "progress-bar-danger"
      : "";

  return (
    <div className={cn("w-full", className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-2 text-sm text-muted">
          <span>{label ?? "Progresso"}</span>
          <span className="font-semibold text-foreground">{v}%</span>
        </div>
      )}
      <div className="progress">
        <div className={cn("progress-bar", barClass)} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
