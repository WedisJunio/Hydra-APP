"use client";

import { useEffect, useState } from "react";
import { X, Droplets } from "lucide-react";

import { getCurrentProfile } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { Client, SanitationType } from "@/lib/saneamento/types";
import { sanitationTypeLabel } from "@/lib/saneamento/types";
import {
  listClients,
  createSanitationProject,
  seedDefaultPhases,
} from "@/lib/saneamento/data";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
};

// Modal só com informações que existem ANTES do trabalho técnico:
// nome, cliente, tipo de obra, localização, dados contratuais.
// Parâmetros técnicos (vazão, população, horizonte, extensão) são
// preenchidos depois, dentro do projeto, conforme concepção/básico avança.

export function NewProjectModal({ open, onClose, onCreated }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [sanitationType, setSanitationType] = useState<SanitationType>("SAA");
  const [contractNumber, setContractNumber] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [state, setState] = useState("MG");
  const [contractValue, setContractValue] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingClients(true);
    listClients().then((list) => {
      if (active) {
        setClients(list);
        setLoadingClients(false);
      }
    });
    return () => {
      active = false;
    };
  }, [open]);

  function reset() {
    setName("");
    setClientId("");
    setSanitationType("SAA");
    setContractNumber("");
    setMunicipality("");
    setState("MG");
    setContractValue("");
    setNotes("");
    setErrorMsg(null);
  }

  async function handleCreate() {
    if (!name.trim()) {
      setErrorMsg("Informe um nome para o projeto.");
      return;
    }
    setCreating(true);
    setErrorMsg(null);

    const profile = await getCurrentProfile();
    if (!profile) {
      setErrorMsg("Usuário não autenticado.");
      setCreating(false);
      return;
    }

    const projectId = await createSanitationProject({
      name: name.trim(),
      manager_id: profile.id,
      created_by: profile.id,
      client_id: clientId || null,
      contract_number: contractNumber || null,
      sanitation_type: sanitationType,
      municipality: municipality || null,
      state: state || null,
      contract_value: contractValue ? Number(contractValue) : null,
      planned_end_date: null,
      notes: notes || null,
    });

    if (!projectId) {
      setErrorMsg("Erro ao criar projeto.");
      setCreating(false);
      return;
    }

    await seedDefaultPhases(projectId);

    setCreating(false);
    reset();
    onCreated(projectId);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--surface)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-3">
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
              }}
            >
              <Droplets size={18} />
            </div>
            <div>
              <h2
                className="text-lg font-bold m-0"
                style={{ letterSpacing: "-0.01em" }}
              >
                Novo projeto de saneamento
              </h2>
              <p className="text-sm text-muted m-0" style={{ marginTop: 2 }}>
                Os parâmetros técnicos (vazão, população, etc.) são preenchidos
                depois, conforme a concepção avança.
              </p>
            </div>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div style={{ padding: "20px 22px" }} className="flex flex-col gap-4">
          <Field label="Nome do projeto">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Ampliação do SAA — Sete Lagoas"
            />
          </Field>

          <div className="grid-2">
            <Field label="Cliente / Concessionária">
              <Select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={loadingClients}
              >
                <option value="">Selecione</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.short_name ? `${c.short_name} — ${c.name}` : c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Tipo de obra">
              <Select
                value={sanitationType}
                onChange={(e) =>
                  setSanitationType(e.target.value as SanitationType)
                }
              >
                <option value="SAA">{sanitationTypeLabel.SAA}</option>
                <option value="SES">{sanitationTypeLabel.SES}</option>
                <option value="SAA_SES">{sanitationTypeLabel.SAA_SES}</option>
              </Select>
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Município">
              <Input
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                placeholder="Ex.: Belo Horizonte"
              />
            </Field>
            <Field label="UF">
              <Select value={state} onChange={(e) => setState(e.target.value)}>
                <option value="MG">MG</option>
                <option value="SP">SP</option>
                <option value="RJ">RJ</option>
                <option value="PR">PR</option>
                <option value="SC">SC</option>
                <option value="RS">RS</option>
                <option value="ES">ES</option>
                <option value="GO">GO</option>
                <option value="DF">DF</option>
                <option value="BA">BA</option>
                <option value="MS">MS</option>
                <option value="MT">MT</option>
                <option value="OUTRO">Outro</option>
              </Select>
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Nº do contrato">
              <Input
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                placeholder="Ex.: COPASA-2026-145"
              />
            </Field>
            <Field label="Valor do contrato (R$)">
              <Input
                type="number"
                step="0.01"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                placeholder="0,00"
              />
            </Field>
          </div>

          <div
            className="text-xs text-muted rounded-md px-3 py-2"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              lineHeight: 1.45,
            }}
          >
            O <strong>prazo previsto do projeto</strong> será calculado quando houver
            tarefas com data prevista (usa a data mais tardia). O{" "}
            <strong>término real</strong> é gravado quando todas as tarefas forem
            concluídas.
          </div>

          <Field label="Observações">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Escopo, particularidades, contatos..."
            />
          </Field>

          {errorMsg && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: "var(--danger-soft)",
                color: "var(--danger-fg)",
                fontSize: 13,
                border: "1px solid #FCA5A5",
              }}
            >
              {errorMsg}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2"
          style={{
            padding: "16px 22px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} loading={creating}>
            Criar projeto
          </Button>
        </div>
      </div>
    </div>
  );
}
