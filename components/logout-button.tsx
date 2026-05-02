"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { clearCurrentProfileCache } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    clearCurrentProfileCache();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      block
      onClick={handleLogout}
      leftIcon={<LogOut size={14} />}
      style={{
        color: "var(--sidebar-fg)",
        background: "transparent",
        border: "1px solid var(--sidebar-border)",
        justifyContent: "flex-start",
      }}
    >
      Sair
    </Button>
  );
}
