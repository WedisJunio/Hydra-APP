"use client";

import { Check, Circle, Clock, Pause, X } from "lucide-react";
import type { ProjectPhase, PhaseStatus } from "@/lib/saneamento/types";
import { phaseStatusLabel } from "@/lib/saneamento/phases";
import { cn } from "@/lib/utils";

function statusIcon(status: PhaseStatus) {
  if (status === "approved") return <Check size={14} />;
  if (status === "in_progress") return <Clock size={14} />;
  if (status === "in_review") return <Clock size={14} />;
  if (status === "on_hold") return <Pause size={14} />;
  if (status === "skipped") return <X size={14} />;
  return <Circle size={12} />;
}

function statusColor(status: PhaseStatus): {
  bg: string;
  fg: string;
  border: string;
  bar: string;
} {
  if (status === "approved")
    return {
      bg: "var(--success-soft)",
      fg: "var(--success)",
      border: "#86EFAC",
      bar: "var(--success)",
    };
  if (status === "in_progress")
    return {
      bg: "var(--primary-soft)",
      fg: "var(--primary)",
      border: "#93C5FD",
      bar: "var(--primary)",
    };
  if (status === "in_review")
    return {
      bg: "var(--warning-soft)",
      fg: "var(--warning)",
      border: "#FCD34D",
      bar: "var(--warning)",
    };
  if (status === "on_hold")
    return {
      bg: "var(--warning-soft)",
      fg: "var(--warning)",
      border: "#FCD34D",
      bar: "var(--warning)",
    };
  if (status === "skipped")
    return {
      bg: "var(--surface-3)",
      fg: "var(--subtle-fg)",
      border: "var(--border)",
      bar: "var(--border-strong)",
    };
  return {
    bg: "var(--surface)",
    fg: "var(--subtle-fg)",
    border: "var(--border)",
    bar: "var(--border-strong)",
  };
}

export function PhaseTimeline({
  phases,
  onPhaseClick,
}: {
  phases: ProjectPhase[];
  onPhaseClick?: (phase: ProjectPhase) => void;
}) {
  if (phases.length === 0) return null;

  const sorted = [...phases].sort((a, b) => a.order - b.order);

  return (
    <div className="phase-timeline">
      <div className="phase-timeline-track">
        {sorted.map((phase, idx) => {
          const colors = statusColor(phase.status);
          const isLast = idx === sorted.length - 1;
          const nextPhase = sorted[idx + 1];
          const linkActive =
            !isLast &&
            (phase.status === "approved" ||
              nextPhase?.status === "in_progress" ||
              nextPhase?.status === "approved");

          return (
            <div className="phase-step" key={phase.id}>
              <button
                type="button"
                onClick={() => onPhaseClick?.(phase)}
                className={cn(
                  "phase-node",
                  phase.status === "skipped" && "phase-node-skipped"
                )}
                style={{
                  background: colors.bg,
                  color: colors.fg,
                  borderColor: colors.border,
                }}
                title={phaseStatusLabel[phase.status]}
              >
                {statusIcon(phase.status)}
              </button>

              <div className="phase-label">
                <div className="phase-label-name">{phase.name}</div>
                <div className="phase-label-status" style={{ color: colors.fg }}>
                  {phaseStatusLabel[phase.status]}
                </div>
              </div>

              {!isLast && (
                <div
                  className="phase-link"
                  style={{
                    background: linkActive ? colors.bar : "var(--border)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .phase-timeline {
          width: 100%;
          padding: 8px 0 0;
          overflow-x: auto;
        }
        .phase-timeline-track {
          display: flex;
          align-items: flex-start;
          min-width: max-content;
          padding-bottom: 16px;
        }
        .phase-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          flex: 1 0 130px;
          max-width: 180px;
        }
        .phase-node {
          width: 36px;
          height: 36px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          padding: 0;
          background: white;
          z-index: 2;
          position: relative;
        }
        .phase-node:hover {
          transform: scale(1.08);
          box-shadow: var(--shadow-sm);
        }
        .phase-node-skipped {
          opacity: 0.5;
        }
        .phase-link {
          position: absolute;
          top: 18px;
          left: 50%;
          height: 2px;
          width: 100%;
          z-index: 1;
        }
        .phase-label {
          margin-top: 8px;
          text-align: center;
          font-size: var(--text-xs);
          padding: 0 6px;
        }
        .phase-label-name {
          font-weight: 600;
          color: var(--foreground);
          line-height: 1.3;
        }
        .phase-label-status {
          margin-top: 2px;
          font-size: 10.5px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
