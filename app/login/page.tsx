"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (active && session) router.push("/dashboard");
    }
    checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogin() {
    if (loading) return;
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setErrorMessage("Informe e-mail e senha.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Painel esquerdo — branding */}
        <div className="login-aside">
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="login-logo">H</div>
            <h1 className="login-title">
              Gestão de projetos<br />feita pra engenharia.
            </h1>
            <p className="login-description">
              Controle de produtividade, tempo e entregas em um só lugar.
              Visão macro pra diretoria, micro pra cada engenheiro.
            </p>
          </div>

          <div className="login-copyright">
            © {new Date().getFullYear()} HydraCode
          </div>

          <div aria-hidden className="login-orb" />
        </div>

        {/* Painel direito — formulário */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="login-form"
        >
          <h2 className="login-form-title">Entrar na sua conta</h2>
          <p className="text-muted text-sm mb-6">
            Acesse o painel HydraCode com suas credenciais.
          </p>

          <div className="flex flex-col gap-4">
            <Field label="E-mail">
              <div className="input-icon-wrap">
                <Mail size={16} className="input-icon" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </Field>

            <Field label="Senha">
              <div className="input-icon-wrap">
                <Lock size={16} className="input-icon" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingLeft: 36 }}
                />
              </div>
            </Field>

            {errorMessage && (
              <div className="login-error">{errorMessage}</div>
            )}

            <Button
              type="submit"
              size="lg"
              block
              loading={loading}
              rightIcon={!loading ? <ArrowRight size={16} /> : undefined}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </div>

          <p className="login-footer">
            Ao entrar você concorda com os{" "}
            <a href="#" className="text-primary font-medium">
              Termos de uso
            </a>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
