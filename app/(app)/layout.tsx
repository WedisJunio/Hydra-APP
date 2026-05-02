"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  MessageSquare,
  Calendar as CalendarIcon,
  Droplets,
  Clock,
  ChevronRight,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

import AuthGuard from "@/components/auth-guard";
import LogoutButton from "@/components/logout-button";
import { Avatar } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase/client";

type MenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const menuItems: MenuItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Saneamento", href: "/saneamento", icon: Droplets },
  { label: "Projetos", href: "/projects", icon: FolderKanban },
  { label: "Tarefas", href: "/tasks", icon: CheckSquare },
  { label: "Ponto", href: "/ponto", icon: Clock },
  { label: "Usuários", href: "/users", icon: Users },
  { label: "Chat", href: "/chat", icon: MessageSquare },
  { label: "Calendário", href: "/calendar", icon: CalendarIcon },
];

type CurrentUserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  coordinator: "Coordenador",
  leader: "Líder",
  employee: "Colaborador",
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [authEmail, setAuthEmail] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !user) return;
      setAuthEmail(user.email || "");

      const { data } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("auth_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (active) setCurrentUser(data ?? null);
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("hydra-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme: "light" | "dark" = saved === "dark" || (!saved && prefersDark) ? "dark" : "light";

    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
  }, []);

  function handleToggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("hydra-theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
  }

  const currentItem = useMemo(
    () => menuItems.find((item) => pathname?.startsWith(item.href)),
    [pathname]
  );

  const displayName = currentUser?.name || authEmail || "Usuário";
  const displayRole =
    (currentUser?.role && roleLabels[currentUser.role]) ||
    currentUser?.role ||
    "Membro da equipe";

  return (
    <AuthGuard>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">H</div>
            <div className="sidebar-brand-meta">
              <span className="sidebar-brand-tag">PLATAFORMA</span>
              <div className="sidebar-brand-name">HydraCode</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="sidebar-section">Menu</div>
            {menuItems.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="sidebar-link"
                  data-active={isActive ? "true" : "false"}
                  title={item.label}
                >
                  <span className="sidebar-link-icon">
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            {currentUser?.id ? (
              <Link
                href={`/users/${currentUser.id}`}
                className="sidebar-user sidebar-user-link"
                title={`Abrir perfil de ${displayName}`}
              >
                <Avatar name={displayName} size="md" />
                <div className="sidebar-user-meta min-w-0 flex-1">
                  <div className="sidebar-user-name">{displayName}</div>
                  <div className="sidebar-user-role">{displayRole}</div>
                </div>
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  className="sidebar-user-chevron"
                />
              </Link>
            ) : (
              <div className="sidebar-user">
                <Avatar name={displayName} size="md" />
                <div className="sidebar-user-meta min-w-0 flex-1">
                  <div className="sidebar-user-name">{displayName}</div>
                  <div className="sidebar-user-role">{displayRole}</div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="app-content">
          <header className="topbar">
            <div className="crumbs">
              <span>HydraCode</span>
              <ChevronRight size={14} strokeWidth={2} />
              <span className="crumbs-current">
                {currentItem?.label ?? "Painel"}
              </span>
            </div>

            <div
              className="flex items-center gap-3"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={handleToggleTheme}
                title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
                aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <div
                className="hidden"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}
              >
                <span className="font-semibold">{displayName}</span>
                <span className="text-muted text-xs">{displayRole}</span>
              </div>
              <Avatar name={displayName} size="sm" primary />
            </div>
          </header>

          <main className="app-main">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
