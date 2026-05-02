import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { padded?: boolean | "sm" | "lg" }
>(function Card({ className, padded = true, ...props }, ref) {
  const padClass =
    padded === "sm"
      ? "card-padded-sm"
      : padded === "lg"
      ? "card-padded-lg"
      : padded
      ? "card-padded"
      : "";
  return <div ref={ref} className={cn("card", padClass, className)} {...props} />;
});

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mb-4", className)}>
      <div>
        <div className="card-title">{title}</div>
        {description && (
          <p className="text-sm text-muted mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
