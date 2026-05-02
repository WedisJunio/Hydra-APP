import { redirect } from "next/navigation";

/** Raiz do site: envia para o login (não havia página em `/`). */
export default function Home() {
  redirect("/login");
}
