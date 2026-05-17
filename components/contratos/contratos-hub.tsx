"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Gavel,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Users,
  Download,
  X,
  Link2,
  Pencil,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage } from "@/lib/supabase/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { canMutateContratosModule } from "@/lib/permissions";
import {
  CONTRACT_SERVICE_TYPES,
  DOC_STATUS_ATTEST_LABEL,
  DOC_STATUS_CAT_LABEL,
  LICITACAO_STATUS,
  LICITACAO_STATUS_LABEL,
  PRO_AVAILABILITY_LABEL,
} from "@/lib/contratos/constants";
import type {
  ContractAtestado,
  ContractCat,
  ContractLicitacao,
  ContractProfessional,
} from "@/lib/contratos/types";
import { analyzeLicitacaoCompatibility } from "@/lib/contratos/compat";
import {
  downloadContratosTemplate,
  exportRowsToExcel,
  parseExcelToRows,
  type ImportKind,
} from "@/lib/contratos/excel";

type TabKey = "visao" | "licitacoes" | "atestados" | "cats" | "import" | "relatorios";

type AppUser = {
  id: string;
  name: string | null;
  email: string | null;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const border =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warning"
        ? "var(--warning)"
        : "var(--border)";
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: "14px 16px",
        background: "var(--surface)",
      }}
    >
      <div className="text-xs text-muted font-semibold uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {hint ? (
        <div className="text-xs text-muted mt-1" style={{ lineHeight: 1.35 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export default function ContratosHub() {
  const [tab, setTab] = useState<TabKey>("visao");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const [professionals, setProfessionals] = useState<ContractProfessional[]>([]);
  const [cats, setCats] = useState<ContractCat[]>([]);
  const [atestados, setAtestados] = useState<ContractAtestado[]>([]);
  const [licitacoes, setLicitacoes] = useState<ContractLicitacao[]>([]);
  const [membros, setMembros] = useState<{ licitacao_id: string; professional_id: string }[]>([]);
  const [licAtestadoLinks, setLicAtestadoLinks] = useState<{ licitacao_id: string; atestado_id: string }[]>(
    []
  );
  const [licCatLinks, setLicCatLinks] = useState<{ licitacao_id: string; cat_id: string }[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);

  const [qSearch, setQSearch] = useState("");
  const [licDetail, setLicDetail] = useState<ContractLicitacao | null>(null);
  const [compatOpen, setCompatOpen] = useState(false);

  /* modais */
  const [modalPro, setModalPro] = useState(false);
  const [modalAtest, setModalAtest] = useState(false);
  const [modalLic, setModalLic] = useState(false);
  const [modalCat, setModalCat] = useState(false);
  const [teamModalLic, setTeamModalLic] = useState<ContractLicitacao | null>(null);
  const [teamSelectedIds, setTeamSelectedIds] = useState<string[]>([]);
  const [manageLic, setManageLic] = useState<ContractLicitacao | null>(null);
  const [manageInternalId, setManageInternalId] = useState("");
  const [manageStatus, setManageStatus] = useState("");
  const [manageAtestIds, setManageAtestIds] = useState<string[]>([]);
  const [manageCatIds, setManageCatIds] = useState<string[]>([]);
  const [licStep, setLicStep] = useState(1);

  const [fPro, setFPro] = useState({
    full_name: "",
    job_title: "",
    crea_number: "",
    crea_state: "",
    specialty: "",
    availability: "disponivel",
    status: "ativo",
    notes: "",
  });

  const [fAtest, setFAtest] = useState({
    title: "",
    holder_company: "",
    client_org: "",
    city: "",
    state: "",
    contract_object: "",
    services_description: "",
    service_type: "Saneamento",
    technical_area: "",
    issue_date: "",
    execution_start: "",
    execution_end: "",
    contract_value: "",
    technical_responsible: "",
    pdf_url: "",
    doc_status: "ok",
    notes: "",
  });

  const [fLic, setFLic] = useState({
    title: "",
    org_name: "",
    city: "",
    state: "",
    edital_number: "",
    modality: "",
    object_text: "",
    published_at: "",
    proposal_deadline: "",
    session_date: "",
    estimated_value: "",
    status: "em_analise" as ContractLicitacao["status"],
    req_types: "" as string,
    req_keywords: "",
    internal_responsible_id: "",
    notes: "",
  });

  const [fCat, setFCat] = useState({
    cat_number: "",
    council: "CREA",
    state: "",
    professional_id: "",
    company_name: "",
    technical_object: "",
    service_type: "Saneamento",
    issue_date: "",
    pdf_url: "",
    notes: "",
  });

  const [impKind, setImpKind] = useState<ImportKind>("atestados");
  const [impFile, setImpFile] = useState<File | null>(null);
  const [impRows, setImpRows] = useState<Record<string, unknown>[]>([]);
  const [impLog, setImpLog] = useState<string[]>([]);

  const canEdit = canMutateContratosModule(myRole);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const sel =
      "id, full_name, job_title, education, crea_number, crea_state, specialty, company_relation, availability, status, user_id, notes, created_at";
    const [
      { data: p, error: e1 },
      { data: c, error: e2 },
      { data: a, error: e3 },
      { data: l, error: e4 },
      { data: m, error: e5 },
      { data: la, error: e6 },
      { data: lc, error: e7 },
    ] = await Promise.all([
      supabase.from("contract_professionals").select(sel).order("full_name"),
      supabase.from("contract_cats").select("*").order("cat_number"),
      supabase.from("contract_atestados").select("*").order("created_at", { ascending: false }),
      supabase.from("contract_licitacoes").select("*").order("proposal_deadline", { ascending: true }),
      supabase.from("contract_licitacao_members").select("licitacao_id, professional_id"),
      supabase.from("contract_licitacao_atestados").select("licitacao_id, atestado_id"),
      supabase.from("contract_licitacao_cats").select("licitacao_id, cat_id"),
    ]);
    const err = e1 || e2 || e3 || e4 || e5 || e6 || e7;
    if (err) {
      setLoadError(getSupabaseErrorMessage(err));
      setLoading(false);
      return;
    }
    setProfessionals((p as ContractProfessional[]) || []);
    setCats((c as ContractCat[]) || []);
    setAtestados((a as ContractAtestado[]) || []);
    setLicitacoes((l as ContractLicitacao[]) || []);
    setMembros((m as { licitacao_id: string; professional_id: string }[]) || []);
    setLicAtestadoLinks(
      ((la as { licitacao_id: string; atestado_id: string }[]) || []).map((row) => ({
        licitacao_id: row.licitacao_id,
        atestado_id: row.atestado_id,
      }))
    );
    setLicCatLinks(
      ((lc as { licitacao_id: string; cat_id: string }[]) || []).map((row) => ({
        licitacao_id: row.licitacao_id,
        cat_id: row.cat_id,
      }))
    );
    let uRes = await supabase
      .from("users")
      .select("id, name, email")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (uRes.error) {
      uRes = await supabase.from("users").select("id, name, email").order("name", { ascending: true });
    }
    setAppUsers((uRes.data as AppUser[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
    getCurrentProfile().then((p) => setMyRole(p?.role ?? null));
  }, [loadAll]);

  const membersMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of membros) {
      if (!map.has(row.licitacao_id)) map.set(row.licitacao_id, new Set());
      map.get(row.licitacao_id)!.add(row.professional_id);
    }
    return map;
  }, [membros]);

  const usersById = useMemo(() => {
    const map = new Map<string, AppUser>();
    for (const u of appUsers) map.set(u.id, u);
    return map;
  }, [appUsers]);

  const alerts = useMemo(() => {
    const items: { level: "danger" | "warning"; text: string }[] = [];
    const now = Date.now();
    const week = 7 * 24 * 3600 * 1000;
    for (const lic of licitacoes) {
      if (!lic.proposal_deadline) continue;
      if (["concluida", "cancelada", "perdida", "vencida"].includes(lic.status)) continue;
      const t = new Date(lic.proposal_deadline).getTime();
      if (!Number.isNaN(t) && t > now && t < now + week) {
        items.push({
          level: "warning",
          text: `Prazo próximo: «${lic.title}» — envio até ${fmtDate(lic.proposal_deadline.slice(0, 10))}.`,
        });
      }
    }
    for (const a of atestados) {
      if (!a.pdf_url || a.doc_status === "sem_arquivo") {
        items.push({
          level: "warning",
          text: `Atestado sem PDF ou marcado sem arquivo: «${a.title}».`,
        });
      }
    }
    for (const cat of cats) {
      if (!cat.pdf_url || cat.status === "sem_arquivo") {
        items.push({
          level: "warning",
          text: `CAT ${cat.cat_number} sem PDF ou pendente de arquivo.`,
        });
      }
    }
    for (const lic of licitacoes) {
      if (!lic.internal_responsible_id && !["concluida", "cancelada"].includes(lic.status)) {
        items.push({ level: "danger", text: `Licitação sem responsável interno: «${lic.title}».` });
      }
    }
    const busyPros = new Map<string, string[]>();
    const licById = new Map(licitacoes.map((x) => [x.id, x]));
    for (const [lid, set] of membersMap) {
      const lic = licById.get(lid);
      if (!lic || !["participando", "pronta_participar", "em_analise"].includes(lic.status)) continue;
      for (const pid of set) {
        if (!busyPros.has(pid)) busyPros.set(pid, []);
        busyPros.get(pid)!.push(lic.title);
      }
    }
    for (const [pid, titles] of busyPros) {
      if (titles.length > 1) {
        const pro = professionals.find((x) => x.id === pid);
        items.push({
          level: "danger",
          text: `Profissional ${pro?.full_name || pid} em múltiplas licitações ativas: ${titles.join("; ")}.`,
        });
      }
    }
    return items.slice(0, 12);
  }, [licitacoes, atestados, cats, membersMap, professionals]);

  const overviewCounts = useMemo(() => {
    const st = (s: string) => licitacoes.filter((l) => l.status === s).length;
    return {
      atestados: atestados.length,
      cats: cats.length,
      profissionais: professionals.length,
      lic_em_analise: st("em_analise"),
      lic_andamento: st("participando") + st("pronta_participar"),
      lic_doc: st("aguardando_documentos") + st("atestados_pendentes"),
      lic_equipe: st("equipe_pendente"),
      lic_vencida: st("vencida"),
      lic_perdida: st("perdida"),
      lic_concluida: st("concluida"),
    };
  }, [atestados, cats, professionals, licitacoes]);

  const filteredLicitacoes = useMemo(() => {
    const q = qSearch.trim().toLowerCase();
    if (!q) return licitacoes;
    return licitacoes.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        (l.org_name || "").toLowerCase().includes(q) ||
        (l.city || "").toLowerCase().includes(q)
    );
  }, [licitacoes, qSearch]);

  const compatForSelected = useMemo(() => {
    if (!licDetail) return null;
    return analyzeLicitacaoCompatibility(licDetail, atestados, cats, professionals, licitacoes, membersMap);
  }, [licDetail, atestados, cats, professionals, licitacoes, membersMap]);

  function openTeamModal(lic: ContractLicitacao) {
    const cur = [...(membersMap.get(lic.id) || [])];
    setTeamSelectedIds(cur);
    setTeamModalLic(lic);
  }

  function toggleTeamMember(id: string) {
    setTeamSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function saveTeamAllocation() {
    if (!teamModalLic || !canEdit) return;
    const licId = teamModalLic.id;
    const { error: delErr } = await supabase
      .from("contract_licitacao_members")
      .delete()
      .eq("licitacao_id", licId);
    if (delErr) {
      showErrorToast("Erro", getSupabaseErrorMessage(delErr));
      return;
    }
    if (teamSelectedIds.length > 0) {
      const rows = teamSelectedIds.map((professional_id) => ({
        licitacao_id: licId,
        professional_id,
        member_role: "integrante",
      }));
      const { error: insErr } = await supabase.from("contract_licitacao_members").insert(rows);
      if (insErr) {
        showErrorToast("Erro ao salvar equipe", getSupabaseErrorMessage(insErr));
        return;
      }
    }
    showSuccessToast("Equipe atualizada", teamModalLic.title);
    setTeamModalLic(null);
    await loadAll();
  }

  function openManageLic(lic: ContractLicitacao) {
    setManageInternalId(lic.internal_responsible_id || "");
    setManageStatus(lic.status);
    setManageAtestIds(licAtestadoLinks.filter((x) => x.licitacao_id === lic.id).map((x) => x.atestado_id));
    setManageCatIds(licCatLinks.filter((x) => x.licitacao_id === lic.id).map((x) => x.cat_id));
    setManageLic(lic);
  }

  function toggleManageAtest(id: string) {
    setManageAtestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleManageCat(id: string) {
    setManageCatIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveManageLic() {
    if (!manageLic || !canEdit) return;
    const licId = manageLic.id;
    const { error: upErr } = await supabase
      .from("contract_licitacoes")
      .update({
        internal_responsible_id: manageInternalId || null,
        status: manageStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", licId);
    if (upErr) {
      showErrorToast("Erro ao atualizar", getSupabaseErrorMessage(upErr));
      return;
    }
    const { error: daErr } = await supabase.from("contract_licitacao_atestados").delete().eq("licitacao_id", licId);
    if (daErr) {
      showErrorToast("Atestados", getSupabaseErrorMessage(daErr));
      return;
    }
    if (manageAtestIds.length > 0) {
      const { error: iaErr } = await supabase.from("contract_licitacao_atestados").insert(
        manageAtestIds.map((atestado_id) => ({ licitacao_id: licId, atestado_id }))
      );
      if (iaErr) {
        showErrorToast("Vínculo atestados", getSupabaseErrorMessage(iaErr));
        return;
      }
    }
    const { error: dcErr } = await supabase.from("contract_licitacao_cats").delete().eq("licitacao_id", licId);
    if (dcErr) {
      showErrorToast("CATs", getSupabaseErrorMessage(dcErr));
      return;
    }
    if (manageCatIds.length > 0) {
      const { error: icErr } = await supabase.from("contract_licitacao_cats").insert(
        manageCatIds.map((cat_id) => ({ licitacao_id: licId, cat_id }))
      );
      if (icErr) {
        showErrorToast("Vínculo CATs", getSupabaseErrorMessage(icErr));
        return;
      }
    }
    showSuccessToast("Licitação atualizada", manageLic.title);
    setManageLic(null);
    await loadAll();
    setLicDetail((cur) =>
      cur?.id === licId
        ? { ...cur, internal_responsible_id: manageInternalId || null, status: manageStatus }
        : cur
    );
  }

  async function submitCat() {
    if (!fCat.cat_number.trim()) {
      showErrorToast("CAT", "Informe o número da CAT.");
      return;
    }
    const { error } = await supabase.from("contract_cats").insert({
      cat_number: fCat.cat_number.trim(),
      council: fCat.council || null,
      state: fCat.state || null,
      professional_id: fCat.professional_id || null,
      company_name: fCat.company_name || null,
      technical_object: fCat.technical_object || null,
      service_type: fCat.service_type || null,
      issue_date: fCat.issue_date || null,
      pdf_url: fCat.pdf_url || null,
      notes: fCat.notes || null,
    });
    if (error) {
      showErrorToast("Erro", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast("CAT cadastrada", fCat.cat_number);
    setModalCat(false);
    setFCat({
      cat_number: "",
      council: "CREA",
      state: "",
      professional_id: "",
      company_name: "",
      technical_object: "",
      service_type: "Saneamento",
      issue_date: "",
      pdf_url: "",
      notes: "",
    });
    await loadAll();
  }

  async function submitProfessional() {
    if (!fPro.full_name.trim()) {
      showErrorToast("Nome obrigatório", "Informe o nome completo.");
      return;
    }
    const { error } = await supabase.from("contract_professionals").insert({
      full_name: fPro.full_name.trim(),
      job_title: fPro.job_title || null,
      crea_number: fPro.crea_number || null,
      crea_state: fPro.crea_state || null,
      specialty: fPro.specialty || null,
      availability: fPro.availability,
      status: fPro.status,
      notes: fPro.notes || null,
    });
    if (error) {
      showErrorToast("Erro ao salvar", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast("Profissional cadastrado", "Registro disponível para alocação.");
    setModalPro(false);
    setFPro({
      full_name: "",
      job_title: "",
      crea_number: "",
      crea_state: "",
      specialty: "",
      availability: "disponivel",
      status: "ativo",
      notes: "",
    });
    await loadAll();
  }

  async function submitAtestado() {
    if (!fAtest.title.trim()) {
      showErrorToast("Identificação obrigatória", "Informe o nome do atestado.");
      return;
    }
    const val =
      fAtest.contract_value.trim() === "" ? null : Number(fAtest.contract_value.replace(",", "."));
    const { error } = await supabase.from("contract_atestados").insert({
      title: fAtest.title.trim(),
      holder_company: fAtest.holder_company || null,
      client_org: fAtest.client_org || null,
      city: fAtest.city || null,
      state: fAtest.state || null,
      contract_object: fAtest.contract_object || null,
      services_description: fAtest.services_description || null,
      service_type: fAtest.service_type || null,
      technical_area: fAtest.technical_area || null,
      issue_date: fAtest.issue_date || null,
      execution_start: fAtest.execution_start || null,
      execution_end: fAtest.execution_end || null,
      contract_value: val,
      technical_responsible: fAtest.technical_responsible || null,
      pdf_url: fAtest.pdf_url || null,
      doc_status: fAtest.doc_status,
      notes: fAtest.notes || null,
    });
    if (error) {
      showErrorToast("Erro ao salvar", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast("Atestado cadastrado", "Disponível no banco e nas análises.");
    setModalAtest(false);
    setFAtest({
      title: "",
      holder_company: "",
      client_org: "",
      city: "",
      state: "",
      contract_object: "",
      services_description: "",
      service_type: "Saneamento",
      technical_area: "",
      issue_date: "",
      execution_start: "",
      execution_end: "",
      contract_value: "",
      technical_responsible: "",
      pdf_url: "",
      doc_status: "ok",
      notes: "",
    });
    await loadAll();
  }

  async function submitLicitacao() {
    if (!fLic.title.trim()) {
      showErrorToast("Nome obrigatório", "Informe o nome da licitação.");
      return;
    }
    const types = fLic.req_types
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const requirements = {
      service_types: types,
      keywords: fLic.req_keywords.trim(),
    };
    const { error } = await supabase.from("contract_licitacoes").insert({
      title: fLic.title.trim(),
      org_name: fLic.org_name || null,
      city: fLic.city || null,
      state: fLic.state || null,
      edital_number: fLic.edital_number || null,
      modality: fLic.modality || null,
      object_text: fLic.object_text || null,
      published_at: fLic.published_at || null,
      proposal_deadline: fLic.proposal_deadline || null,
      session_date: fLic.session_date || null,
      estimated_value:
        fLic.estimated_value.trim() === ""
          ? null
          : Number(fLic.estimated_value.replace(",", ".")),
      status: fLic.status,
      requirements_json: requirements,
      notes: fLic.notes || null,
      internal_responsible_id: fLic.internal_responsible_id || null,
    });
    if (error) {
      showErrorToast("Erro ao salvar", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast("Licitação cadastrada", "Revise equipe e documentos na lista.");
    setModalLic(false);
    setLicStep(1);
    setFLic({
      title: "",
      org_name: "",
      city: "",
      state: "",
      edital_number: "",
      modality: "",
      object_text: "",
      published_at: "",
      proposal_deadline: "",
      session_date: "",
      estimated_value: "",
      status: "em_analise",
      req_types: "",
      req_keywords: "",
      internal_responsible_id: "",
      notes: "",
    });
    await loadAll();
  }

  async function runImportPreview() {
    if (!impFile) {
      showErrorToast("Arquivo", "Selecione uma planilha .xlsx.");
      return;
    }
    try {
      const rows = await parseExcelToRows(impFile);
      setImpRows(rows);
      setImpLog([`${rows.length} linha(s) lidas. Revise e confirme a importação.`]);
    } catch (e) {
      showErrorToast("Leitura", e instanceof Error ? e.message : "Falha ao ler Excel.");
    }
  }

  async function commitImport() {
    if (!canEdit) {
      showErrorToast("Permissão", "Somente coordenação/gestão pode importar.");
      return;
    }
    if (impRows.length === 0) return;
    setImpLog((prev) => [...prev, "Importando…"]);
    const logs: string[] = [];
    try {
      if (impKind === "profissionais") {
        for (let i = 0; i < impRows.length; i++) {
          const r = impRows[i];
          const nome = String(r.nome_completo || "").trim();
          if (!nome) {
            logs.push(`Linha ${i + 2}: nome_completo vazio — ignorada.`);
            continue;
          }
          const { error } = await supabase.from("contract_professionals").insert({
            full_name: nome,
            job_title: String(r.cargo || "") || null,
            education: String(r.formacao || "") || null,
            crea_number: String(r.crea || "") || null,
            crea_state: String(r.estado_registro || "") || null,
            specialty: String(r.especialidade || "") || null,
            company_relation: String(r.vinculo || "") || null,
            availability: String(r.disponibilidade || "disponivel"),
            status: String(r.status || "ativo"),
            notes: String(r.observacoes || "") || null,
          });
          if (error) logs.push(`Linha ${i + 2}: ${getSupabaseErrorMessage(error)}`);
        }
      } else if (impKind === "atestados") {
        for (let i = 0; i < impRows.length; i++) {
          const r = impRows[i];
          const title = String(r.nome_atestado || "").trim();
          if (!title) {
            logs.push(`Linha ${i + 2}: nome_atestado vazio — ignorada.`);
            continue;
          }
          const val =
            r.valor_contrato === "" || r.valor_contrato === undefined || r.valor_contrato === null
              ? null
              : Number(r.valor_contrato);
          const { error } = await supabase.from("contract_atestados").insert({
            title,
            holder_company: String(r.empresa || "") || null,
            client_org: String(r.orgao_cliente || "") || null,
            city: String(r.cidade || "") || null,
            state: String(r.estado || "") || null,
            contract_object: String(r.objeto || "") || null,
            services_description: String(r.descricao_servicos || "") || null,
            service_type: String(r.tipo_atestado || "") || null,
            technical_area: String(r.area_tecnica || "") || null,
            issue_date: String(r.data_emissao || "")?.slice(0, 10) || null,
            execution_start: String(r.inicio_execucao || "")?.slice(0, 10) || null,
            execution_end: String(r.fim_execucao || "")?.slice(0, 10) || null,
            contract_value: val,
            technical_responsible: String(r.responsavel_tecnico || "") || null,
            notes: String(r.observacoes || "") || null,
          });
          if (error) logs.push(`Linha ${i + 2}: ${getSupabaseErrorMessage(error)}`);
        }
      } else if (impKind === "cats") {
        for (let i = 0; i < impRows.length; i++) {
          const r = impRows[i];
          const num = String(r.numero_cat || "").trim();
          if (!num) {
            logs.push(`Linha ${i + 2}: numero_cat vazio — ignorada.`);
            continue;
          }
          const proName = String(r.profissional_nome || "").trim();
          let professional_id: string | null = null;
          if (proName) {
            const found = professionals.find((p) => p.full_name.toLowerCase() === proName.toLowerCase());
            professional_id = found?.id || null;
          }
          const { error } = await supabase.from("contract_cats").insert({
            cat_number: num,
            council: String(r.conselho || "") || null,
            state: String(r.estado || "") || null,
            professional_id,
            company_name: String(r.empresa || "") || null,
            technical_object: String(r.objeto_tecnico || "") || null,
            service_type: String(r.tipo_servico || "") || null,
            issue_date: String(r.data_emissao || "")?.slice(0, 10) || null,
            pdf_url: String(r.pdf_url || "") || null,
            notes: String(r.observacoes || "") || null,
          });
          if (error) logs.push(`Linha ${i + 2}: ${getSupabaseErrorMessage(error)}`);
        }
      } else if (impKind === "licitacoes") {
        for (let i = 0; i < impRows.length; i++) {
          const r = impRows[i];
          const title = String(r.nome || "").trim();
          if (!title) {
            logs.push(`Linha ${i + 2}: nome vazio — ignorada.`);
            continue;
          }
          const csvTypes = String(r.tipos_servico_csv || "");
          const types = csvTypes
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean);
          const { error } = await supabase.from("contract_licitacoes").insert({
            title,
            org_name: String(r.orgao || "") || null,
            city: String(r.cidade || "") || null,
            state: String(r.estado || "") || null,
            edital_number: String(r.edital || "") || null,
            modality: String(r.modalidade || "") || null,
            object_text: String(r.objeto || "") || null,
            published_at: String(r.data_publicacao || "")?.slice(0, 10) || null,
            proposal_deadline: String(r.prazo_proposta || "") || null,
            session_date: String(r.sessao || "")?.slice(0, 10) || null,
            estimated_value:
              r.valor_estimado === "" || r.valor_estimado === undefined
                ? null
                : Number(r.valor_estimado),
            status: String(r.status || "em_analise"),
            requirements_json: {
              service_types: types,
              keywords: String(r.palavras_chave || ""),
            },
            notes: String(r.observacoes || "") || null,
          });
          if (error) logs.push(`Linha ${i + 2}: ${getSupabaseErrorMessage(error)}`);
        }
      }
      setImpLog((prev) => [...prev, ...logs, "Concluído. Recarregando dados…"]);
      await loadAll();
      showSuccessToast("Importação finalizada", "Verifique o log abaixo para linhas com erro.");
    } catch (e) {
      showErrorToast("Importação", e instanceof Error ? e.message : "Falha.");
    }
  }

  function exportReport() {
    const rows = licitacoes.map((l) => {
      const resp = l.internal_responsible_id ? usersById.get(l.internal_responsible_id) : undefined;
      const nA = licAtestadoLinks.filter((x) => x.licitacao_id === l.id).length;
      const nC = licCatLinks.filter((x) => x.licitacao_id === l.id).length;
      return {
        titulo: l.title,
        orgao: l.org_name,
        cidade: l.city,
        status: LICITACAO_STATUS_LABEL[l.status as keyof typeof LICITACAO_STATUS_LABEL] || l.status,
        responsavel: resp ? resp.name?.trim() || resp.email || "" : "",
        atestados_vinculados: nA,
        cats_vinculadas: nC,
        prazo: l.proposal_deadline,
      };
    });
    exportRowsToExcel(`relatorio_licitacoes_${Date.now()}.xlsx`, rows);
  }

  return (
    <div>
      <PageHeader
        title="Contratos & Licitações"
        description="Central para atestados técnicos, CATs, capacidade da equipe e análise de licitações. Importe planilhas, cruze requisitos do edital e evite conflitos de alocação."
        actions={
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="secondary" leftIcon={<RefreshCw size={16} />} onClick={() => void loadAll()}>
              Atualizar
            </Button>
            {canEdit ? (
              <>
                <Button leftIcon={<Plus size={16} />} onClick={() => setModalLic(true)}>
                  Nova licitação
                </Button>
                <Button variant="secondary" leftIcon={<Award size={16} />} onClick={() => setModalAtest(true)}>
                  Novo atestado
                </Button>
                <Button variant="secondary" leftIcon={<Users size={16} />} onClick={() => setModalPro(true)}>
                  Novo profissional
                </Button>
                <Button variant="secondary" leftIcon={<FileText size={16} />} onClick={() => setModalCat(true)}>
                  Nova CAT
                </Button>
                <Button
                  variant="primary"
                  leftIcon={<FileSpreadsheet size={16} />}
                  onClick={() => {
                    setTab("import");
                    setImpRows([]);
                    setImpLog([]);
                  }}
                >
                  Importar Excel
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {loadError ? (
        <Card padded className="mb-6 border-danger/30 bg-[var(--danger-soft)]">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="text-danger shrink-0" size={22} />
            <div>
              <div className="font-bold text-danger-fg">Não foi possível carregar o módulo</div>
              <p className="text-sm mt-1 opacity-90">{loadError}</p>
              <p className="text-sm mt-2">
                Rode o script SQL em <code className="text-xs">lib/sql/contratos-licitacoes.sql</code> no Supabase
                (SQL Editor) e atualize a página.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="tabs mb-6" style={{ flexWrap: "wrap", overflowX: "visible" }}>
        {(
          [
            ["visao", "Visão geral", LayoutDashboard],
            ["licitacoes", "Licitações", Gavel],
            ["atestados", "Banco de atestados", Award],
            ["cats", "CATs & profissionais", Users],
            ["import", "Importar Excel", Upload],
            ["relatorios", "Relatórios", FileText],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            className="tab"
            data-active={tab === k ? "true" : "false"}
            onClick={() => setTab(k)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted text-sm">Carregando dados…</div>
      ) : tab === "visao" ? (
        <div className="flex flex-col gap-6">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <StatCard label="Atestados cadastrados" value={overviewCounts.atestados} />
            <StatCard label="CATs cadastradas" value={overviewCounts.cats} />
            <StatCard label="Profissionais" value={overviewCounts.profissionais} />
            <StatCard label="Licitações em análise" value={overviewCounts.lic_em_analise} />
            <StatCard label="Em andamento / prontas" value={overviewCounts.lic_andamento} />
            <StatCard label="Documentação pendente" value={overviewCounts.lic_doc} tone="warning" />
            <StatCard label="Equipe pendente" value={overviewCounts.lic_equipe} tone="warning" />
            <StatCard label="Vencidas" value={overviewCounts.lic_vencida} />
            <StatCard label="Perdidas" value={overviewCounts.lic_perdida} />
            <StatCard label="Concluídas" value={overviewCounts.lic_concluida} />
          </div>
          <Card padded>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-warning" />
              Alertas operacionais
            </h3>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted m-0">Nenhum alerta crítico no momento.</p>
            ) : (
              <ul className="space-y-2 m-0 pl-4 list-disc text-sm">
                {alerts.map((a, i) => (
                  <li key={i} style={{ color: a.level === "danger" ? "var(--danger)" : "var(--warning)" }}>
                    {a.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : tab === "licitacoes" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <Input
                className="pl-9"
                placeholder="Buscar licitação…"
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3">
            {filteredLicitacoes.map((lic) => {
              const resp = lic.internal_responsible_id ? usersById.get(lic.internal_responsible_id) : undefined;
              const respLabel = resp ? resp.name?.trim() || resp.email || "Usuário" : null;
              const nA = licAtestadoLinks.filter((x) => x.licitacao_id === lic.id).length;
              const nC = licCatLinks.filter((x) => x.licitacao_id === lic.id).length;
              return (
              <Card key={lic.id} padded>
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-base truncate">{lic.title}</div>
                    <div className="text-sm text-muted flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {lic.org_name && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 size={13} /> {lic.org_name}
                        </span>
                      )}
                      {(lic.city || lic.state) && (
                        <span>
                          {lic.city}
                          {lic.city && lic.state ? " / " : ""}
                          {lic.state}
                        </span>
                      )}
                      <span>Prazo: {lic.proposal_deadline ? fmtDate(lic.proposal_deadline) : "—"}</span>
                      {respLabel ? (
                        <span className="inline-flex items-center gap-1">
                          <Users size={13} /> Resp.: {respLabel}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <Users size={13} /> Sem responsável interno
                        </span>
                      )}
                      {nA > 0 || nC > 0 ? (
                        <span>
                          Vínculos: {nA} atest. · {nC} CAT
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="info">{LICITACAO_STATUS_LABEL[lic.status as never] || lic.status}</Badge>
                    {canEdit ? (
                    <Button
                      variant="ghost"
                      leftIcon={<Pencil size={14} />}
                      onClick={() => openManageLic(lic)}
                    >
                      Gerir
                    </Button>
                    ) : null}
                    {canEdit ? (
                    <Button
                      variant="ghost"
                      leftIcon={<Users size={14} />}
                      onClick={() => openTeamModal(lic)}
                    >
                      Equipe
                    </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      leftIcon={<Link2 size={14} />}
                      onClick={() => {
                        setLicDetail(lic);
                        setCompatOpen(true);
                      }}
                    >
                      Análise de compatibilidade
                    </Button>
                  </div>
                </div>
              </Card>
            );
            })}
            {filteredLicitacoes.length === 0 ? (
              <EmptyState title="Nenhuma licitação" description="Cadastre ou importe pela aba correspondente." />
            ) : null}
          </div>
        </div>
      ) : tab === "atestados" ? (
        <Card padded>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-[var(--border)]">
                  <th className="py-2 pr-3">Título</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Cidade</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Status doc.</th>
                </tr>
              </thead>
              <tbody>
                {atestados.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--border)]">
                    <td className="py-2 pr-3 font-medium">{a.title}</td>
                    <td className="py-2 pr-3">{a.client_org || "—"}</td>
                    <td className="py-2 pr-3">
                      {a.city}
                      {a.city && a.state ? "/" : ""}
                      {a.state}
                    </td>
                    <td className="py-2 pr-3">{a.service_type || "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={a.doc_status === "ok" ? "success" : "warning"}>
                        {DOC_STATUS_ATTEST_LABEL[a.doc_status] || a.doc_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {atestados.length === 0 ? (
            <EmptyState title="Banco vazio" description="Importe Excel ou cadastre um atestado." />
          ) : null}
        </Card>
      ) : tab === "cats" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card padded>
            <h3 className="font-bold mb-3">Profissionais cadastrados</h3>
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {professionals.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-lg border border-[var(--border)] flex justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{p.full_name}</div>
                    <div className="text-muted text-xs">
                      {p.crea_number || "CREA —"} · {PRO_AVAILABILITY_LABEL[p.availability] || p.availability}
                    </div>
                  </div>
                  <Badge variant={p.status === "ativo" ? "success" : "neutral"}>{p.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card padded>
            <h3 className="font-bold mb-3">CATs</h3>
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {cats.map((c) => (
                <div key={c.id} className="p-3 rounded-lg border border-[var(--border)] text-sm">
                  <div className="font-semibold">{c.cat_number}</div>
                  <div className="text-muted text-xs">
                    {c.council || "—"} {c.state} · {c.service_type || "—"}
                  </div>
                  <Badge variant="info" className="mt-1">
                    {DOC_STATUS_CAT_LABEL[c.status] || c.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : tab === "import" ? (
        <Card padded className="max-w-4xl">
          <h3 className="font-bold mb-2 flex items-center gap-2">
            <Upload size={18} />
            Importar dados via Excel
          </h3>
          <p className="text-sm text-muted mb-4">
            Baixe o modelo, preencha e envie. Validações básicas e log por linha. Tipos: atestados, CATs,
            profissionais ou licitações.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tipo de importação">
              <Select value={impKind} onChange={(e) => setImpKind(e.target.value as ImportKind)}>
                <option value="atestados">Atestados</option>
                <option value="cats">CATs</option>
                <option value="profissionais">Profissionais</option>
                <option value="licitacoes">Licitações</option>
              </Select>
            </Field>
            <Field label="Arquivo (.xlsx)">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setImpFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant="secondary"
              leftIcon={<Download size={16} />}
              onClick={() => downloadContratosTemplate(impKind)}
            >
              Baixar modelo
            </Button>
            <Button variant="secondary" onClick={() => void runImportPreview()} leftIcon={<FileSpreadsheet size={16} />}>
              Ler planilha
            </Button>
            {canEdit && impRows.length > 0 ? (
              <Button onClick={() => void commitImport()} leftIcon={<CheckCircle2 size={16} />}>
                Confirmar importação ({impRows.length} linhas)
              </Button>
            ) : null}
          </div>
          {impRows.length > 0 ? (
            <div className="mt-4 text-xs text-muted max-h-48 overflow-y-auto border border-[var(--border)] rounded-md p-2">
              Pré-visualização: {impRows.length} registro(s). Primeira linha:{" "}
              <code>{JSON.stringify(impRows[0])}</code>
            </div>
          ) : null}
          {impLog.length > 0 ? (
            <pre className="mt-4 text-xs bg-[var(--surface-2)] p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
              {impLog.join("\n")}
            </pre>
          ) : null}
        </Card>
      ) : (
        <Card padded>
          <h3 className="font-bold mb-3">Relatórios rápidos</h3>
          <p className="text-sm text-muted mb-4">
            Exporte a situação das licitações para Excel. Relatórios PDF detalhados podem ser evoluídos com base
            nestes dados.
          </p>
          <Button leftIcon={<Download size={16} />} onClick={exportReport}>
            Exportar licitações (.xlsx)
          </Button>
        </Card>
      )}

      {/* Modal compatibilidade */}
      {compatOpen && licDetail && compatForSelected ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setCompatOpen(false)}
        >
          <Card
            padded
            className="max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-2 mb-3">
              <div>
                <div className="text-xs font-bold text-muted uppercase">Análise de compatibilidade</div>
                <div className="font-bold text-lg">{licDetail.title}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setCompatOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <Badge
              variant={
                compatForSelected.level === "alta"
                  ? "success"
                  : compatForSelected.level === "media"
                    ? "warning"
                    : "neutral"
              }
            >
              Compatibilidade {compatForSelected.level === "alta" ? "alta" : compatForSelected.level === "media" ? "média" : "baixa"}
            </Badge>
            <p className="text-sm mt-3 leading-relaxed">{compatForSelected.narrative}</p>
            <div className="mt-4 text-xs text-muted space-y-2">
              <div>
                <strong className="text-foreground">Vínculos na licitação:</strong>{" "}
                {licAtestadoLinks.filter((x) => x.licitacao_id === licDetail.id).length} atestado(s),{" "}
                {licCatLinks.filter((x) => x.licitacao_id === licDetail.id).length} CAT(s)
              </div>
              <div>
                <strong className="text-foreground">Atestados alinh:</strong> {compatForSelected.matchingAtestados.length}
              </div>
              <div>
                <strong className="text-foreground">CATs alinh:</strong> {compatForSelected.matchingCats.length}
              </div>
              <div>
                <strong className="text-foreground">Profissionais disponíveis:</strong>{" "}
                {compatForSelected.availableProfessionals.length}
              </div>
              {compatForSelected.busyProfessionals.length > 0 ? (
                <div className="text-warning">
                  <strong>Conflitos:</strong>{" "}
                  {compatForSelected.busyProfessionals.map((b) => b.professional.full_name).join(", ")}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {/* Modal profissional */}
      {modalPro ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setModalPro(false)}
        >
          <Card padded className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-3">Novo profissional</h3>
            <div className="space-y-3">
              <Field label="Nome completo">
                <Input value={fPro.full_name} onChange={(e) => setFPro({ ...fPro, full_name: e.target.value })} />
              </Field>
              <Field label="Cargo">
                <Input value={fPro.job_title} onChange={(e) => setFPro({ ...fPro, job_title: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="CREA">
                  <Input value={fPro.crea_number} onChange={(e) => setFPro({ ...fPro, crea_number: e.target.value })} />
                </Field>
                <Field label="UF registro">
                  <Input value={fPro.crea_state} onChange={(e) => setFPro({ ...fPro, crea_state: e.target.value })} />
                </Field>
              </div>
              <Field label="Especialidade">
                <Input value={fPro.specialty} onChange={(e) => setFPro({ ...fPro, specialty: e.target.value })} />
              </Field>
              <Field label="Disponibilidade">
                <Select
                  value={fPro.availability}
                  onChange={(e) => setFPro({ ...fPro, availability: e.target.value })}
                >
                  <option value="disponivel">Disponível</option>
                  <option value="parcial">Parcial</option>
                  <option value="indisponivel">Indisponível</option>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setModalPro(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void submitProfessional()}>Salvar</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Modal atestado */}
      {modalAtest ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setModalAtest(false)}
        >
          <Card padded className="max-w-lg w-full my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-3">Novo atestado</h3>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <Field label="Identificação">
                <Input value={fAtest.title} onChange={(e) => setFAtest({ ...fAtest, title: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Empresa">
                  <Input
                    value={fAtest.holder_company}
                    onChange={(e) => setFAtest({ ...fAtest, holder_company: e.target.value })}
                  />
                </Field>
                <Field label="Órgão / cliente">
                  <Input
                    value={fAtest.client_org}
                    onChange={(e) => setFAtest({ ...fAtest, client_org: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Cidade">
                  <Input value={fAtest.city} onChange={(e) => setFAtest({ ...fAtest, city: e.target.value })} />
                </Field>
                <Field label="UF">
                  <Input value={fAtest.state} onChange={(e) => setFAtest({ ...fAtest, state: e.target.value })} />
                </Field>
              </div>
              <Field label="Objeto">
                <Textarea
                  value={fAtest.contract_object}
                  onChange={(e) => setFAtest({ ...fAtest, contract_object: e.target.value })}
                  style={{ minHeight: 64 }}
                />
              </Field>
              <Field label="Tipo de serviço">
                <Select
                  value={fAtest.service_type}
                  onChange={(e) => setFAtest({ ...fAtest, service_type: e.target.value })}
                >
                  {CONTRACT_SERVICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="URL do PDF (ou anexe depois no storage)">
                <Input
                  value={fAtest.pdf_url}
                  onChange={(e) => setFAtest({ ...fAtest, pdf_url: e.target.value })}
                  placeholder="https://..."
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setModalAtest(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void submitAtestado()}>Salvar</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Modal licitação — etapas resumidas */}
      {modalLic ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setModalLic(false)}
        >
          <Card padded className="max-w-lg w-full my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold m-0">Nova licitação · etapa {licStep}/3</h3>
              <Badge variant="neutral">{licStep === 1 ? "Dados" : licStep === 2 ? "Requisitos" : "Observações"}</Badge>
            </div>
            {licStep === 1 ? (
              <div className="space-y-3">
                <Field label="Nome">
                  <Input value={fLic.title} onChange={(e) => setFLic({ ...fLic, title: e.target.value })} />
                </Field>
                <Field label="Órgão licitante">
                  <Input value={fLic.org_name} onChange={(e) => setFLic({ ...fLic, org_name: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Cidade">
                    <Input value={fLic.city} onChange={(e) => setFLic({ ...fLic, city: e.target.value })} />
                  </Field>
                  <Field label="UF">
                    <Input value={fLic.state} onChange={(e) => setFLic({ ...fLic, state: e.target.value })} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Edital">
                    <Input
                      value={fLic.edital_number}
                      onChange={(e) => setFLic({ ...fLic, edital_number: e.target.value })}
                    />
                  </Field>
                  <Field label="Modalidade">
                    <Input value={fLic.modality} onChange={(e) => setFLic({ ...fLic, modality: e.target.value })} />
                  </Field>
                </div>
                <Field label="Objeto">
                  <Textarea
                    value={fLic.object_text}
                    onChange={(e) => setFLic({ ...fLic, object_text: e.target.value })}
                    style={{ minHeight: 72 }}
                  />
                </Field>
                <Field label="Valor estimado">
                  <Input
                    value={fLic.estimated_value}
                    onChange={(e) => setFLic({ ...fLic, estimated_value: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Publicação">
                    <Input
                      type="date"
                      value={fLic.published_at}
                      onChange={(e) => setFLic({ ...fLic, published_at: e.target.value })}
                    />
                  </Field>
                  <Field label="Prazo proposta">
                    <Input
                      type="datetime-local"
                      value={fLic.proposal_deadline}
                      onChange={(e) => setFLic({ ...fLic, proposal_deadline: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ) : licStep === 2 ? (
              <div className="space-y-3">
                <Field label="Tipos de atestado exigidos (separados por vírgula)">
                  <Input
                    value={fLic.req_types}
                    onChange={(e) => setFLic({ ...fLic, req_types: e.target.value })}
                    placeholder="ex.: Saneamento, BIM"
                  />
                </Field>
                <Field label="Palavras-chave do edital">
                  <Input
                    value={fLic.req_keywords}
                    onChange={(e) => setFLic({ ...fLic, req_keywords: e.target.value })}
                  />
                </Field>
                <Field label="Responsável interno">
                  <Select
                    value={fLic.internal_responsible_id}
                    onChange={(e) => setFLic({ ...fLic, internal_responsible_id: e.target.value })}
                  >
                    <option value="">— Não definido —</option>
                    {appUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name?.trim() || u.email || u.id}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status inicial">
                  <Select value={fLic.status} onChange={(e) => setFLic({ ...fLic, status: e.target.value })}>
                    {LICITACAO_STATUS.map((s) => (
                      <option key={s} value={s}>
                        {LICITACAO_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <Field label="Observações">
                <Textarea
                  value={fLic.notes}
                  onChange={(e) => setFLic({ ...fLic, notes: e.target.value })}
                  style={{ minHeight: 100 }}
                />
              </Field>
            )}
            <div className="flex justify-between gap-2 mt-4">
              <Button variant="ghost" onClick={() => (licStep > 1 ? setLicStep(licStep - 1) : setModalLic(false))}>
                {licStep > 1 ? "Voltar" : "Cancelar"}
              </Button>
              {licStep < 3 ? (
                <Button onClick={() => setLicStep(licStep + 1)}>Próximo</Button>
              ) : (
                <Button onClick={() => void submitLicitacao()}>Salvar licitação</Button>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {modalCat ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setModalCat(false)}
        >
          <Card padded className="max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-3">Nova CAT</h3>
            <div className="space-y-3">
              <Field label="Número da CAT">
                <Input value={fCat.cat_number} onChange={(e) => setFCat({ ...fCat, cat_number: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Conselho">
                  <Input value={fCat.council} onChange={(e) => setFCat({ ...fCat, council: e.target.value })} />
                </Field>
                <Field label="UF">
                  <Input value={fCat.state} onChange={(e) => setFCat({ ...fCat, state: e.target.value })} />
                </Field>
              </div>
              <Field label="Profissional responsável (opcional)">
                <Select
                  value={fCat.professional_id}
                  onChange={(e) => setFCat({ ...fCat, professional_id: e.target.value })}
                >
                  <option value="">—</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Empresa">
                <Input
                  value={fCat.company_name}
                  onChange={(e) => setFCat({ ...fCat, company_name: e.target.value })}
                />
              </Field>
              <Field label="Objeto técnico">
                <Textarea
                  value={fCat.technical_object}
                  onChange={(e) => setFCat({ ...fCat, technical_object: e.target.value })}
                  style={{ minHeight: 64 }}
                />
              </Field>
              <Field label="Tipo de serviço">
                <Select
                  value={fCat.service_type}
                  onChange={(e) => setFCat({ ...fCat, service_type: e.target.value })}
                >
                  {CONTRACT_SERVICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data de emissão">
                <Input
                  type="date"
                  value={fCat.issue_date}
                  onChange={(e) => setFCat({ ...fCat, issue_date: e.target.value })}
                />
              </Field>
              <Field label="URL do PDF">
                <Input value={fCat.pdf_url} onChange={(e) => setFCat({ ...fCat, pdf_url: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setModalCat(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void submitCat()}>Salvar</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {teamModalLic ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setTeamModalLic(null)}
        >
          <Card padded className="max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-1">Equipe · {teamModalLic.title}</h3>
            <p className="text-sm text-muted m-0 mb-3">
              Marque os profissionais que participarão. O painel de compatibilidade alerta sobre alocações em outras
              licitações ativas.
            </p>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {professionals.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-2 rounded-lg border border-[var(--border)] cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={teamSelectedIds.includes(p.id)}
                    onChange={() => toggleTeamMember(p.id)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium block truncate">{p.full_name}</span>
                    <span className="text-xs text-muted">
                      {PRO_AVAILABILITY_LABEL[p.availability] || p.availability}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setTeamModalLic(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void saveTeamAllocation()}>Salvar equipe</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {manageLic ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setManageLic(null)}
        >
          <Card
            padded
            className="max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold mb-1">Gerir licitação · {manageLic.title}</h3>
            <p className="text-sm text-muted m-0 mb-4">
              Responsável interno, status e documentos já previstos para esta licitação (atestados e CATs).
            </p>
            <div className="space-y-3">
              <Field label="Responsável interno">
                <Select
                  value={manageInternalId}
                  onChange={(e) => setManageInternalId(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="">— Não definido —</option>
                  {appUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name?.trim() || u.email || u.id}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={manageStatus} onChange={(e) => setManageStatus(e.target.value)} disabled={!canEdit}>
                  {LICITACAO_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {LICITACAO_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Atestados vinculados</div>
                <div className="space-y-1 max-h-36 overflow-y-auto border border-[var(--border)] rounded-lg p-2">
                  {atestados.length === 0 ? (
                    <p className="text-sm text-muted m-0">Nenhum atestado cadastrado.</p>
                  ) : (
                    atestados.map((a) => (
                      <label key={a.id} className="flex items-start gap-2 text-sm cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={manageAtestIds.includes(a.id)}
                          onChange={() => toggleManageAtest(a.id)}
                          disabled={!canEdit}
                        />
                        <span className="min-w-0">{a.title}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">CATs vinculadas</div>
                <div className="space-y-1 max-h-36 overflow-y-auto border border-[var(--border)] rounded-lg p-2">
                  {cats.length === 0 ? (
                    <p className="text-sm text-muted m-0">Nenhuma CAT cadastrada.</p>
                  ) : (
                    cats.map((c) => (
                      <label key={c.id} className="flex items-start gap-2 text-sm cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={manageCatIds.includes(c.id)}
                          onChange={() => toggleManageCat(c.id)}
                          disabled={!canEdit}
                        />
                        <span className="min-w-0">
                          {c.cat_number}
                          {c.service_type ? ` · ${c.service_type}` : ""}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setManageLic(null)}>
                Fechar
              </Button>
              {canEdit ? <Button onClick={() => void saveManageLic()}>Salvar</Button> : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
