export type ContractProfessional = {
  id: string;
  full_name: string;
  job_title: string | null;
  education: string | null;
  crea_number: string | null;
  crea_state: string | null;
  specialty: string | null;
  company_relation: string | null;
  availability: string;
  status: string;
  user_id: string | null;
  notes: string | null;
  created_at: string;
};

export type ContractCat = {
  id: string;
  cat_number: string;
  council: string | null;
  state: string | null;
  professional_id: string | null;
  company_name: string | null;
  related_contract_ref: string | null;
  technical_object: string | null;
  activity_type: string | null;
  service_type: string | null;
  issue_date: string | null;
  pdf_url: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export type ContractAtestado = {
  id: string;
  title: string;
  holder_company: string | null;
  client_org: string | null;
  city: string | null;
  state: string | null;
  contract_number: string | null;
  contract_object: string | null;
  services_description: string | null;
  service_type: string | null;
  technical_area: string | null;
  issue_date: string | null;
  execution_start: string | null;
  execution_end: string | null;
  contract_value: number | null;
  technical_responsible: string | null;
  cat_id: string | null;
  pdf_url: string | null;
  cat_pdf_url: string | null;
  doc_status: string;
  notes: string | null;
  created_at: string;
};

export type ContractLicitacao = {
  id: string;
  title: string;
  org_name: string | null;
  city: string | null;
  state: string | null;
  edital_number: string | null;
  modality: string | null;
  object_text: string | null;
  published_at: string | null;
  proposal_deadline: string | null;
  session_date: string | null;
  estimated_value: number | null;
  status: string;
  internal_responsible_id: string | null;
  requirements_json: Record<string, unknown>;
  notes: string | null;
  created_at: string;
};

export type LicitacaoRequirements = {
  service_types?: string[];
  areas?: string[];
  keywords?: string;
  min_experience_years?: number;
  notes?: string;
};
