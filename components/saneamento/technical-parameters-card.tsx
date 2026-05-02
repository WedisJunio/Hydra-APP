"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Pencil,
  Save,
  X,
  Users as UsersIcon,
  Ruler,
  Calendar,
  Filter,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { SanitationProject } from "@/lib/saneamento/types";

type Props = {
  project: SanitationProject;
  onSaved: () => void;
};

// Card editável de parâmetros técnicos. Os valores nascem vazios e são
// preenchidos ao longo do projeto (concepção → básico → executivo). Quando
// vazio, mostra um CTA suave; quando preenchido, mostra os valores e um
// botão de editar.

export function TechnicalParametersCard({ project, onSaved }: Props) {
  const hasAnyValue =
    project.design_flow_lps != null ||
    project.population_current != null ||
    project.population_final != null ||
    project.horizon_years != null ||
    project.network_length_m != null ||
    !!project.treatment_system;

  const [editing, setEditing] = useState(false);

  const [designFlow, setDesignFlow] = useState(
    project.design_flow_lps?.toString() ?? ""
  );
  const [popCurrent, setPopCurrent] = useState(
    project.population_current?.toString() ?? ""
  );
  const [popFinal, setPopFinal] = useState(
    project.population_final?.toString() ?? ""
  );
  const [horizon, setHorizon] = useState(
    project.horizon_years?.toString() ?? ""
  );
  const [network, setNetwork] = useState(
    project.network_length_m?.toString() ?? ""
  );
  const [treatment, setTreatment] = useState(project.treatment_system ?? "");
  const [saving, setSaving] = useState(false);

  // Quando o projeto recarrega de fora, atualiza os campos
  useEffect(() => {
    setDesignFlow(project.design_flow_lps?.toString() ?? "");
    setPopCurrent(project.population_current?.toString() ?? "");
    setPopFinal(project.population_final?.toString() ?? "");
    setHorizon(project.horizon_years?.toString() ?? "");
    setNetwork(project.network_length_m?.toString() ?? "");
    setTreatment(project.treatment_system ?? "");
  }, [project]);

  function startEdit() {
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDesignFlow(project.design_flow_lps?.toString() ?? "");
    setPopCurrent(project.population_current?.toString() ?? "");
    setPopFinal(project.population_final?.toString() ?? "");
    setHorizon(project.horizon_years?.toString() ?? "");
    setNetwork(project.network_length_m?.toString() ?? "");
    setTreatment(project.treatment_system ?? "");
  }

  async function handleSave() {
    setSaving(true);
    await supabase
      .from("projects")
      .update({
        design_flow_lps: designFlow ? Number(designFlow) : null,
        population_current: popCurrent ? Number(popCurrent) : null,
        population_final: popFinal ? Number(popFinal) : null,
        horizon_years: horizon ? Number(horizon) : null,
        network_length_m: network ? Number(network) : null,
        treatment_system: treatment.trim() || null,
      })
      .eq("id", project.id);
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="card-title flex items-center gap-2">
            <Activity size={16} className="text-primary" />
            Parâmetros técnicos
          </div>
          <p className="text-sm text-muted mt-1">
            Vazão, população, horizonte e extensão. Atualize conforme avança a
            concepção e o projeto básico.
          </p>
        </div>
        {!editing && (
          <Button
            size="sm"
            variant={hasAnyValue ? "ghost" : "primary"}
            leftIcon={<Pencil size={14} />}
            onClick={startEdit}
          >
            {hasAnyValue ? "Editar" : "Preencher parâmetros"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="grid-3">
            <Field label="Vazão de projeto (l/s)">
              <Input
                type="number"
                step="0.01"
                value={designFlow}
                onChange={(e) => setDesignFlow(e.target.value)}
                placeholder="Ex.: 120"
              />
            </Field>
            <Field label="População atual (hab.)">
              <Input
                type="number"
                value={popCurrent}
                onChange={(e) => setPopCurrent(e.target.value)}
                placeholder="Ex.: 25.000"
              />
            </Field>
            <Field label="População fim de plano (hab.)">
              <Input
                type="number"
                value={popFinal}
                onChange={(e) => setPopFinal(e.target.value)}
                placeholder="Ex.: 35.000"
              />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="Horizonte (anos)">
              <Input
                type="number"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
                placeholder="Ex.: 20"
              />
            </Field>
            <Field label="Extensão de rede (m)">
              <Input
                type="number"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                placeholder="metros"
              />
            </Field>
            <Field label="Sistema de tratamento">
              <Input
                value={treatment}
                onChange={(e) => setTreatment(e.target.value)}
                placeholder="Ex.: UASB + filtro biológico"
              />
            </Field>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              loading={saving}
              leftIcon={<Save size={14} />}
            >
              Salvar
            </Button>
            <Button
              variant="ghost"
              onClick={cancelEdit}
              leftIcon={<X size={14} />}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : !hasAnyValue ? (
        <div
          style={{
            padding: 20,
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--border-strong)",
            background: "var(--surface-2)",
            textAlign: "center",
          }}
        >
          <p className="text-sm text-muted m-0">
            Os parâmetros técnicos ainda não foram definidos.
            <br />
            Eles costumam sair na fase de concepção e podem ser ajustados depois.
          </p>
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <ParameterCell
            icon={<Activity size={14} />}
            label="Vazão de projeto"
            value={
              project.design_flow_lps != null
                ? `${project.design_flow_lps} l/s`
                : null
            }
          />
          <ParameterCell
            icon={<UsersIcon size={14} />}
            label="População atual"
            value={
              project.population_current != null
                ? project.population_current.toLocaleString("pt-BR") + " hab"
                : null
            }
          />
          <ParameterCell
            icon={<UsersIcon size={14} />}
            label="População fim de plano"
            value={
              project.population_final != null
                ? project.population_final.toLocaleString("pt-BR") + " hab"
                : null
            }
          />
          <ParameterCell
            icon={<Calendar size={14} />}
            label="Horizonte"
            value={
              project.horizon_years != null
                ? `${project.horizon_years} anos`
                : null
            }
          />
          <ParameterCell
            icon={<Ruler size={14} />}
            label="Extensão de rede"
            value={
              project.network_length_m != null
                ? `${(project.network_length_m / 1000).toLocaleString("pt-BR", {
                    maximumFractionDigits: 2,
                  })} km`
                : null
            }
          />
          <ParameterCell
            icon={<Filter size={14} />}
            label="Sistema de tratamento"
            value={project.treatment_system}
          />
        </div>
      )}
    </Card>
  );
}

function ParameterCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: "var(--radius-md)",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-1 text-xs text-muted">
        <span style={{ color: "var(--primary)", display: "inline-flex" }}>
          {icon}
        </span>
        {label}
      </div>
      <div
        className="font-semibold mt-1"
        style={{
          fontSize: 16,
          color: value ? "var(--foreground)" : "var(--subtle-fg)",
        }}
      >
        {value ?? (
          <Badge variant="neutral" className="font-normal">
            A definir
          </Badge>
        )}
      </div>
    </div>
  );
}
