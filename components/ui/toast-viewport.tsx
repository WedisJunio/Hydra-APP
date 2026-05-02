"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  subscribeToToasts,
  type ToastItem,
  type ToastVariant,
} from "@/lib/toast";

const TOAST_DURATION_MS = 3600;

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") {
    return <CheckCircle2 size={16} aria-hidden />;
  }
  if (variant === "error") {
    return <AlertTriangle size={16} aria-hidden />;
  }
  return <Info size={16} aria-hidden />;
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToToasts((toast) => {
      setToasts((current) => [...current, toast]);

      const duration = toast.durationMs ?? TOAST_DURATION_MS;
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, duration);
    });

    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" role="region" aria-label="Notificações">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn("toast", `toast-${toast.variant}`)}
          role={toast.variant === "error" ? "alert" : "status"}
          aria-live={toast.variant === "error" ? "assertive" : "polite"}
        >
          <span className="toast-icon">
            <ToastIcon variant={toast.variant} />
          </span>
          <div className="toast-content">
            <strong className="toast-title">{toast.title}</strong>
            {toast.message && <span className="toast-message">{toast.message}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
