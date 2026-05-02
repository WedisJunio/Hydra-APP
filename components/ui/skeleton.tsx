import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} style={style} {...props} />;
}

/** Skeleton card simples para listas/grids enquanto carrega. */
export function SkeletonCard({ height = 92 }: { height?: number }) {
  return (
    <div className="card card-padded">
      <Skeleton style={{ height: 12, width: "40%", marginBottom: 12 }} />
      <Skeleton style={{ height, width: "100%" }} />
    </div>
  );
}
