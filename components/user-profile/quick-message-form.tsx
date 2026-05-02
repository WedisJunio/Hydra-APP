"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, X } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

export function QuickMessageForm({
  recipientId,
  recipientName,
}: {
  recipientId: string;
  recipientName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSend = async () => {
    if (!message.trim()) {
      showErrorToast("Digite uma mensagem");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId,
          content: message,
        }),
      });

      if (!response.ok) throw new Error("Erro ao enviar mensagem");

      showSuccessToast("Mensagem enviada com sucesso");
      setMessage("");
      setIsOpen(false);
    } catch (error) {
      showErrorToast("Erro ao enviar mensagem");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        leftIcon={<Send size={14} />}
        onClick={() => setIsOpen(true)}
      >
        Enviar Mensagem
      </Button>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Mensagem para {recipientName}</h3>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setIsOpen(false)}
          disabled={loading}
        >
          <X size={14} />
        </Button>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Digite sua mensagem..."
        className="w-full px-3 py-2 border border-border rounded-md bg-surface text-sm resize-none mb-3"
        rows={4}
        disabled={loading}
      />

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => setIsOpen(false)}
          disabled={loading}
          className="flex-1"
        >
          Cancelar
        </Button>
        <Button
          onClick={handleSend}
          disabled={loading}
          className="flex-1"
          leftIcon={<Send size={14} />}
        >
          {loading ? "Enviando..." : "Enviar"}
        </Button>
      </div>
    </div>
  );
}
