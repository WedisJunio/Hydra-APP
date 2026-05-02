"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { UserProfile } from "@/lib/user-profile/types";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

export function DownloadDataButton({ profile }: { profile: UserProfile }) {
  const handleDownload = () => {
    try {
      const data = {
        perfil: {
          id: profile.id,
          nome: profile.name,
          nomeCompleto: profile.full_name,
          email: profile.email,
          telefone: profile.phone,
          endereco: profile.address,
          dataDownload: new Date().toISOString(),
        },
        trabalho: {
          cargo: profile.job_title,
          departamento: profile.department,
          papel: profile.role,
          andar: profile.floor_number,
          horarioInicio: profile.work_start_time,
          horarioFim: profile.work_end_time,
          dataEntrada: profile.created_at,
        },
        contato: {
          email: profile.email,
          telefone: profile.phone,
          linkedin: profile.linkedin_url,
        },
        disponibilidade: {
          status: profile.availability_status,
          horarios: {
            inicio: profile.work_start_time,
            fim: profile.work_end_time,
          },
        },
        pessoal: {
          dataNascimento: profile.date_of_birth,
          fotoUrl: profile.photo_url,
          biografia: profile.bio,
        },
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `perfil-${profile.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccessToast("Dados baixados com sucesso");
    } catch (error) {
      console.error("Error downloading data:", error);
      showErrorToast("Erro ao baixar dados");
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={<Download size={14} />}
      onClick={handleDownload}
    >
      Baixar Dados
    </Button>
  );
}
