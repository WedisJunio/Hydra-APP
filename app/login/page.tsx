"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight, User } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { COMPANY_LOGO_SRC } from "@/lib/company-logo";

type Tab = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("login");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Cadastro
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupDone, setSignupDone] = useState(false);

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

  function switchTab(t: Tab) {
    setTab(t);
    setErrorMessage("");
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
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
      setErrorMessage(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message
      );
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
    setLoading(false);
  }

  // ── Cadastro ───────────────────────────────────────────────────────────────
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const trimmedFirstName = signupFirstName.trim();
    const trimmedLastName = signupLastName.trim();
    const trimmedEmail = signupEmail.trim();
    const fullName = `${trimmedFirstName} ${trimmedLastName}`.trim();

    if (!trimmedFirstName || !trimmedLastName || !trimmedEmail || !signupPassword) {
      setErrorMessage("Preencha todos os campos obrigatórios (nome, sobrenome, e-mail e senha).");
      return;
    }
    if (signupPassword.length < 6) {
      setErrorMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setErrorMessage("As senhas não conferem.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    // 1. Cria usuário no Supabase Auth (full_name nos metadados)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: signupPassword,
      options: {
        data: {
          full_name: fullName,
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
        },
      },
    });

    if (authError) {
      const msg =
        authError.message === "User already registered"
          ? "Este e-mail já está cadastrado."
          : authError.message;
      setErrorMessage(msg);
      setLoading(false);
      return;
    }

    const authUserId = authData.user?.id;

    // 2. Insere registro na tabela pública `users`
    // Salvamos tanto `name` (display curto) quanto `full_name` (nome completo).
    // Esse `name` é o que aparece no sidebar, listagem de usuários, tarefas e PDFs.
    if (authUserId) {
      const { error: insertError } = await supabase.from("users").insert({
        name: fullName,
        full_name: fullName,
        email: trimmedEmail.toLowerCase(),
        role: "projetista",
        password_hash: `disabled:${crypto.randomUUID()}`,
        is_active: true,
        auth_user_id: authUserId,
      });

      if (insertError) {
        // Não bloqueia — conta Auth criada, perfil pode ser corrigido depois
        console.error("Erro ao criar perfil na tabela users:", insertError.message);
      }
    }

    // 3. Se email confirmation estiver desativado no Supabase, já redireciona
    if (authData.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      // Email confirmation ativo → mostra aviso
      setSignupDone(true);
    }

    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Painel esquerdo — branding */}
        <div className="login-aside">
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="login-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={COMPANY_LOGO_SRC}
                alt="Logo da empresa"
                className="login-logo-img"
              />
            </div>
            <h1 className="login-title">
              Gestão de projetos<br />feita pra engenharia.
            </h1>
            <p className="login-description">
              Controle de produtividade, tempo e entregas em um só lugar.
              Visão macro pra diretoria, micro pra cada engenheiro.
            </p>
          </div>

          <div className="login-copyright">
            © {new Date().getFullYear()}
          </div>

          <div aria-hidden className="login-orb" />
        </div>

        {/* Painel direito — formulário */}
        <div className="login-form">

          {/* Abas */}
          <div
            style={{
              display: "flex",
              gap: 4,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 4,
              marginBottom: 28,
            }}
          >
            {(["login", "signup"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "calc(var(--radius-md) - 2px)",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                  transition: "background 0.15s, color 0.15s",
                  background: tab === t ? "var(--background)" : "transparent",
                  color: tab === t ? "var(--foreground)" : "var(--muted-fg)",
                  boxShadow: tab === t ? "var(--shadow-sm)" : "none",
                }}
              >
                {t === "login" ? "Entrar" : "Cadastrar-se"}
              </button>
            ))}
          </div>

          {/* ── Tab: Login ── */}
          {tab === "login" && (
            <form onSubmit={handleLogin}>
              <h2 className="login-form-title">Entrar na sua conta</h2>
              <p className="text-muted text-sm mb-6">
                Acesse a plataforma com suas credenciais.
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
                Não tem conta?{" "}
                <button
                  type="button"
                  onClick={() => switchTab("signup")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--primary)",
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  Cadastre-se
                </button>
              </p>
            </form>
          )}

          {/* ── Tab: Cadastro ── */}
          {tab === "signup" && (
            <>
              {signupDone ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: "var(--success-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                      fontSize: 24,
                    }}
                  >
                    ✉️
                  </div>
                  <h2 className="login-form-title" style={{ marginBottom: 8 }}>
                    Confirme seu e-mail
                  </h2>
                  <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
                    Enviamos um link de confirmação para{" "}
                    <strong>{signupEmail}</strong>. Verifique sua caixa de entrada
                    e clique no link para ativar sua conta.
                  </p>
                  <Button variant="secondary" block onClick={() => { setSignupDone(false); switchTab("login"); }}>
                    Voltar para o login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSignup}>
                  <h2 className="login-form-title">Criar conta</h2>
                  <p className="text-muted text-sm mb-6">
                    O nome e sobrenome que você informar serão usados em todas as
                    áreas da plataforma (sidebar, tarefas, relatórios, PDFs).
                  </p>

                  <div className="flex flex-col gap-4">
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                      }}
                    >
                      <Field label="Nome *">
                        <div className="input-icon-wrap">
                          <User size={16} className="input-icon" />
                          <Input
                            type="text"
                            value={signupFirstName}
                            onChange={(e) => setSignupFirstName(e.target.value)}
                            placeholder="João"
                            autoComplete="given-name"
                            style={{ paddingLeft: 36 }}
                          />
                        </div>
                      </Field>
                      <Field label="Sobrenome *">
                        <Input
                          type="text"
                          value={signupLastName}
                          onChange={(e) => setSignupLastName(e.target.value)}
                          placeholder="Silva"
                          autoComplete="family-name"
                        />
                      </Field>
                    </div>

                    {(signupFirstName || signupLastName) && (
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "var(--primary-soft)",
                          borderRadius: "var(--radius-md)",
                          fontSize: 12,
                          color: "var(--primary)",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <User size={12} />
                        Você será exibido como{" "}
                        <strong>
                          {`${signupFirstName} ${signupLastName}`.trim() || "—"}
                        </strong>
                      </div>
                    )}

                    <Field label="E-mail *">
                      <div className="input-icon-wrap">
                        <Mail size={16} className="input-icon" />
                        <Input
                          type="email"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          placeholder="voce@empresa.com"
                          autoComplete="email"
                          style={{ paddingLeft: 36 }}
                        />
                      </div>
                    </Field>

                    <Field label="Senha *">
                      <div className="input-icon-wrap">
                        <Lock size={16} className="input-icon" />
                        <Input
                          type="password"
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          autoComplete="new-password"
                          style={{ paddingLeft: 36 }}
                        />
                      </div>
                    </Field>

                    <Field label="Confirmar senha *">
                      <div className="input-icon-wrap">
                        <Lock size={16} className="input-icon" />
                        <Input
                          type="password"
                          value={signupConfirm}
                          onChange={(e) => setSignupConfirm(e.target.value)}
                          placeholder="Repita a senha"
                          autoComplete="new-password"
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
                      {loading ? "Criando conta..." : "Criar conta"}
                    </Button>
                  </div>

                  <p className="login-footer">
                    Já tem conta?{" "}
                    <button
                      type="button"
                      onClick={() => switchTab("login")}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--primary)",
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      Entrar
                    </button>
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
