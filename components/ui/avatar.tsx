"use client";

import * as React from "react";
import { cn, getInitials } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

export function Avatar({
  name,
  src,
  size = "md",
  primary = false,
  className,
  style,
}: {
  name?: string | null;
  /** URL da foto; se falhar ou estiver vazia, mostra iniciais a partir de `name`. */
  src?: string | null;
  size?: Size;
  primary?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImage = Boolean(src && !imgFailed);

  React.useEffect(() => {
    setImgFailed(false);
  }, [src]);

  const sizeClass =
    size === "xs"
      ? "avatar-xs"
      : size === "sm"
        ? "avatar-sm"
        : size === "lg"
          ? "avatar-lg"
          : size === "xl"
            ? "avatar-xl"
            : "";

  return (
    <span
      className={cn("avatar", sizeClass, primary && "avatar-primary", className)}
      title={name ?? undefined}
      style={{
        ...style,
        ...(showImage ? { padding: 0 } : undefined),
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          onError={() => setImgFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
