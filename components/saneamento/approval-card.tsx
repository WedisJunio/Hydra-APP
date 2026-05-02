"use client";

import {
  Building2,
  ClipboardCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  Pencil,
  X,
} from "lucide-react";

import type { ExternalApproval } from "@/lib/saneamento/types";
import {
  approvalStatusLabel,
  approvalStatusVariant,
} from "@/lib/saneamento/agencies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString + "T00:00:00");
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function ApprovalCard({
  approval,
  onEdit,
  onDelete,
  onRequestDelete,
  onCancelDelete,
  confirmingDelete,
  onMarkApproved,
  onMarkRejected,
}: {
  approval: ExternalApproval;
  onEdit?: () => void;
  onDelete?: () => void;
  onRequestDelete?: () => void;
  onCancelDelete?: () => void;
  confirmingDelete?: boolean;
  onMarkApproved?: () => void;
  onMarkRejected?: () => void;
}) {
  const isClosed =
    approval.status === "approved" ||
    approval.status === "rejected" ||
    approval.status === "cancelled";
  const days = isClosed ? null : daysUntil(approval.expected_response_date);
  const overdue = days !== null && days < 0 && !isClosed;
  const closingSoon = days !== null && days >= 0 && days <= 7 && !isClosed;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid",
        borderColor: overdue
          ? "#FCA5A5"
          : closingSoon
          ? "#FDE68A"
          : "var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 16,
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              background: "var(--primary-soft)",
              color: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Building2 size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-md">{approval.agency}</strong>
              <Badge variant={approvalStatusVariant[approval.status]} dot>
                {approvalStatusLabel[approval.status]}
              </Badge>
            </div>
            {approval.approval_type && (
              <div className="text-sm text-muted mt-1">
                {approval.approval_type}
              </div>
            )}
            {approval.process_number && (
              <div className="text-xs text-subtle mt-1">
                Processo {approval.process_number}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onEdit && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onEdit}
              title="Editar"
            >
              <Pencil size={14} />
            </Button>
          )}
          {onDelete && (
            confirmingDelete ? (
              <>
                <Button size="sm" variant="danger" onClick={onDelete}>
                  Excluir
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelDelete}>
                  <X size={12} />
                </Button>
              </>
            ) : (
              <Button
                size="icon-sm"
                variant="danger-ghost"
                onClick={onRequestDelete ?? onDelete}
                title="Excluir"
              >
                <Trash2 size={14} />
              </Button>
            )
          )}
        </div>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 10,
          }}
        >
          <div className="text-xs text-muted">Protocolada</div>
          <div className="text-sm font-semibold">
            {formatDate(approval.submitted_date)}
          </div>
        </div>
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 10,
          }}
        >
          <div className="text-xs text-muted">Prazo previsto</div>
          <div className="text-sm font-semibold">
            {formatDate(approval.expected_response_date)}
            {approval.expected_response_days
              ? ` (${approval.expected_response_days}d)`
              : ""}
          </div>
        </div>
        <div
          style={{
            background:
              approval.status === "approved"
                ? "var(--success-soft)"
                : approval.status === "rejected"
                ? "var(--danger-soft)"
                : overdue
                ? "var(--danger-soft)"
                : closingSoon
                ? "var(--warning-soft)"
                : "var(--surface-2)",
            border: "1px solid",
            borderColor:
              approval.status === "approved"
                ? "#BBF7D0"
                : approval.status === "rejected" || overdue
                ? "#FCA5A5"
                : closingSoon
                ? "#FDE68A"
                : "var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 10,
          }}
        >
          <div
            className="text-xs"
            style={{
              color:
                approval.status === "approved"
                  ? "var(--success-fg)"
                  : approval.status === "rejected" || overdue
                  ? "var(--danger-fg)"
                  : closingSoon
                  ? "var(--warning-fg)"
                  : "var(--muted-fg)",
            }}
          >
            {approval.status === "approved"
              ? "Aprovada em"
              : approval.status === "rejected"
              ? "Reprovada em"
              : "Status do prazo"}
          </div>
          <div
            className="text-sm font-semibold flex items-center gap-1"
            style={{
              color:
                approval.status === "approved"
                  ? "var(--success-fg)"
                  : approval.status === "rejected" || overdue
                  ? "var(--danger-fg)"
                  : closingSoon
                  ? "var(--warning-fg)"
                  : "var(--foreground)",
            }}
          >
            {approval.status === "approved" && (
              <>
                <CheckCircle2 size={13} />
                {formatDate(approval.actual_response_date)}
              </>
            )}
            {approval.status === "rejected" && (
              <>
                <XCircle size={13} />
                {formatDate(approval.actual_response_date)}
              </>
            )}
            {!isClosed && days !== null && (
              <>
                {overdue ? (
                  <AlertCircle size={13} />
                ) : (
                  <Clock size={13} />
                )}
                {overdue
                  ? `Atrasada ${Math.abs(days)}d`
                  : days === 0
                  ? "Vence hoje"
                  : `${days}d restantes`}
              </>
            )}
            {!isClosed && days === null && <span>—</span>}
          </div>
        </div>
      </div>

      {approval.notes && (
        <div className="text-sm text-muted mb-3" style={{ lineHeight: 1.5 }}>
          {approval.notes}
        </div>
      )}

      {!isClosed && (onMarkApproved || onMarkRejected) && (
        <div className="flex gap-2">
          {onMarkApproved && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<ClipboardCheck size={13} />}
              onClick={onMarkApproved}
            >
              Marcar como aprovada
            </Button>
          )}
          {onMarkRejected && (
            <Button
              size="sm"
              variant="danger-ghost"
              leftIcon={<XCircle size={13} />}
              onClick={onMarkRejected}
            >
              Marcar como reprovada
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
