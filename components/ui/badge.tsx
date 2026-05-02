import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("badge", {
  variants: {
    variant: {
      neutral: "badge-neutral",
      primary: "badge-primary",
      success: "badge-success",
      warning: "badge-warning",
      danger: "badge-danger",
      info: "badge-info",
    },
    dot: { true: "badge-dot" },
  },
  defaultVariants: { variant: "neutral" },
});

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, dot, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, dot }), className)}
      {...props}
    />
  );
}
