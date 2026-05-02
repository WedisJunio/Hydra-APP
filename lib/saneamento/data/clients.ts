import { supabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/saneamento/types";

const SELECT = "id, name, short_name, type, cnpj, state, city, contact_name, contact_email, contact_phone, notes";

/** Lista todas as concessionárias / contratantes ordenadas por sigla. */
export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select(SELECT)
    .order("short_name", { ascending: true });
  if (error) {
    console.error("Erro ao listar clientes:", error.message);
    return [];
  }
  return (data as unknown as Client[]) || [];
}

export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Erro ao buscar cliente:", error.message);
    return null;
  }
  return (data as unknown as Client) || null;
}
