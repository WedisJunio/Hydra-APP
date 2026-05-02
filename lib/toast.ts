export type ToastVariant = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
  durationMs?: number;
};

type ToastListener = (item: ToastItem) => void;

const listeners = new Set<ToastListener>();

function emit(item: ToastItem) {
  listeners.forEach((listener) => listener(item));
}

function createToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function subscribeToToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showToast(input: Omit<ToastItem, "id">) {
  emit({
    ...input,
    id: createToastId(),
  });
}

export function showSuccessToast(title: string, message?: string) {
  showToast({ title, message, variant: "success" });
}

export function showErrorToast(title: string, message?: string) {
  showToast({ title, message, variant: "error", durationMs: 5500 });
}

export function showInfoToast(title: string, message?: string) {
  showToast({ title, message, variant: "info" });
}
