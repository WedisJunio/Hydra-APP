import * as React from "react";
import { cn, getInitials } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

export function Avatar({
  name,
  size = "md",
  primary = false,
  className,
}: {
  name?: string | null;
  size?: Size;
  primary?: boolean;
  className?: string;
}) {
  const sizeClass =
    size === "sm" ? "avatar-sm" : size === "lg" ? "avatar-lg" : size === "xl" ? "avatar-xl" : "";

  return (
    <span
      className={cn("avatar", sizeClass, primary && "avatar-primary", className)}
      title={name ?? undefined}
    >
      {getInitials(name)}
    </span>
  );
}
