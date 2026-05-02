"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Database } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Página de debug de conexão com Supabase.
 * Não está no menu — só acessível via URL direta para diagnóstico.
 */
export default function TestSupabasePage() {
  const [status, setStatus] = useState<"testing" | "ok" | "error">("testing");
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      const { count, error } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true });

      if (error) {
        setError(error.message);
        setStatus("error");
        return;
      }
      setProjectCount(count ?? 0);
      setStatus("ok");
    }
    testConnection();
  }, []);

  return (
    <div>
      <PageHeader
        title="Diagnóstico de conexão"
        description="Página interna para verificar conectividade com Supabase."
      />

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--radius-md)",
              background: "var(--primary-soft)",
              color: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Database size={18} />
          </div>
          <div>
            <h3 className="text-md font-semibold">Conexão Supabase</h3>
            {status === "testing" && (
              <Badge variant="neutral" dot>
                Testando...
              </Badge>
            )}
            {status === "ok" && (
              <Badge variant="success" dot>
                <CheckCircle2 size={11} />
                Funcionando
              </Badge>
            )}
            {status === "error" && (
              <Badge variant="danger" dot>
                <AlertTriangle size={11} />
                Erro
              </Badge>
            )}
          </div>
        </div>

        {projectCount !== null && (
          <p className="text-sm">
            Projetos cadastrados:{" "}
            <strong>{projectCount}</strong>
          </p>
        )}
        {error && (
          <p className="text-sm text-danger" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
