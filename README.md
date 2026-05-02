# HydraCode

Plataforma de gestão de projetos de engenharia. Foco inicial: **projetos de
saneamento** (SAA / SES) para concessionárias estaduais.

---

## Stack

- **Next.js 15** (App Router, Server Components-ready)
- **React 18**
- **TypeScript**
- **Supabase** (Postgres + Auth + Storage + RLS)
- **Recharts** (gráficos)
- **Lucide React** (ícones)
- Design system handwritten em CSS puro (`app/globals.css`) — tokens, primitivos,
  utility classes Tailwind-ish. Sem dependência de Tailwind em si.

---

## Como rodar localmente

```bash
npm install
cp .env.local.example .env.local   # se existir; senão crie manualmente
npm run dev
```

`.env.local` precisa ter:

```
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Acesse `http://localhost:3000`. A primeira tela é o login.

---

## Setup do banco (Supabase)

As migrations vivem em `lib/sql/`. **Rode na ordem abaixo**, no SQL Editor do
Supabase Studio. Todas são idempotentes.

| Ordem | Arquivo                          | O que faz                                                              |
|------:|----------------------------------|------------------------------------------------------------------------|
| 1     | `saneamento-schema.sql`          | Tabelas: clients, project_phases, external_approvals, document_revisions, arts. Estende projects com campos de saneamento. Seed de COPASA + CAJ. |
| 2     | `permissions.sql`                | RLS em todas as tabelas + helper functions. Define papéis: admin, manager, coordinator, leader, employee. |
| 3     | `chat-groups.sql`                | Cria grupos avulsos de chat, garante grupo por projeto e adapta `messages` para `chat_group_id`. |
| 4     | `tasks-phase-link.sql`           | Adiciona coluna `phase_id` em `tasks`.                                 |
| 5     | `saneamento-phase-structure.sql` | Estrutura Fase > Título > Subtítulo e campos avançados em tarefas (prioridade, anexos, comentários, ordenação). |
| 6     | `tasks-start-date-guard.sql`     | Garante start_date no dia da criação e limita alteração para líder/coordenador/admin. |
| 7     | `journal-schema.sql`             | Tabela `project_journal_entries` (diário) + RLS.                       |
| 8     | `fix-auth-link.sql`              | Vincula `public.users.auth_user_id` ao `auth.users.id` por e-mail. Trigger pra novos cadastros. |

Depois disso, **promova um usuário a admin**:

```sql
UPDATE public.users SET role = 'admin' WHERE LOWER(email) = LOWER('seu@email.com');
```

E **garanta que ele existe no Auth**: Studio → Authentication → Users → Add user
com o mesmo e-mail e uma senha. Depois faça login no app com essas credenciais.

---

## Estrutura de pastas

```
hydra-app-starter/
├── app/
│   ├── (app)/                  Rotas autenticadas (route group)
│   │   ├── dashboard/
│   │   ├── saneamento/         Módulo de saneamento (lista + detalhe)
│   │   ├── projects/           Projetos genéricos (legado)
│   │   ├── tasks/              Kanban global de tarefas
│   │   ├── users/
│   │   ├── chat/
│   │   ├── calendar/
│   │   └── layout.tsx          Sidebar + topbar
│   ├── login/
│   ├── globals.css             Design system completo
│   └── layout.tsx              Root (importa Inter, ToastViewport)
├── components/
│   ├── ui/                     Primitivos do design system (Button, Card, etc.)
│   ├── saneamento/             Componentes específicos do módulo
│   ├── auth-guard.tsx
│   └── logout-button.tsx
├── lib/
│   ├── saneamento/
│   │   ├── data/               ◄ Camada de dados (todas as queries Supabase)
│   │   │   ├── clients.ts
│   │   │   ├── projects.ts
│   │   │   ├── phases.ts
│   │   │   ├── tasks.ts
│   │   │   ├── approvals.ts
│   │   │   ├── revisions.ts
│   │   │   ├── arts.ts
│   │   │   ├── journal.ts
│   │   │   ├── users.ts
│   │   │   └── index.ts        Barrel re-export
│   │   ├── types.ts            Tipos compartilhados
│   │   ├── phases.ts           Templates de etapa + labels de status
│   │   └── agencies.ts         Órgãos comuns + tipos de aprovação
│   ├── sql/                    Migrations Supabase
│   ├── supabase/
│   │   ├── client.ts           Browser client
│   │   └── profile.ts          Cache de perfil + getCurrentProfile()
│   ├── toast.ts                API global de toasts
│   └── utils.ts                cn(), formatters, getInitials...
├── public/
└── tsconfig.json
```

### Convenção: camada de dados

**Componentes não fazem `supabase.from(...)` diretamente.** Toda query de
saneamento passa por `lib/saneamento/data/`. Padrão:

```ts
// ✅ Correto
import { listProjectTasks, createTask } from "@/lib/saneamento/data";
const tasks = await listProjectTasks(projectId);

// ❌ Antigo / a evitar
import { supabase } from "@/lib/supabase/client";
const { data } = await supabase.from("tasks").select(...).eq("project_id", projectId);
```

Quando precisar de uma query nova:

1. Adicione a função no arquivo apropriado em `lib/saneamento/data/`
2. Tipos vão pra `lib/saneamento/types.ts` (ou tipo local no arquivo data)
3. Re-exporte em `lib/saneamento/data/index.ts` se for nova
4. Importe no componente

Vantagens:
- Schema muda → mexe em 1 arquivo, não em 8 componentes
- Fácil testar isoladamente
- Evita inconsistências (cada componente selecionando campos diferentes)

---

## Papéis e permissões

Definidos em `lib/sql/permissions.sql` via Row Level Security do Supabase:

| Papel       | Pode                                                           |
|-------------|----------------------------------------------------------------|
| admin       | Tudo, em todas as tabelas                                      |
| manager     | Cria projetos, gerencia portfólio, edita projetos onde lidera  |
| coordinator | Igual manager mas sem deletar coisas globais                    |
| leader      | Edita projetos onde está como líder                            |
| employee    | Vê só projetos onde participa, edita suas tarefas              |

---

## Convenções de código

- Componentes: PascalCase, arquivos kebab-case (`tasks-by-phase.tsx`)
- Funções de data: verbo + entidade (`listProjectTasks`, `createTask`, `deleteRevision`)
- Tipos: PascalCase (`SanitationProject`, `JournalEntry`)
- Toasts: usar `lib/toast.ts` (`showSuccessToast`, `showErrorToast`, etc.)
- Estilos: classes do design system em `globals.css`. Inline `style={...}` só
  pra one-offs. Evitar `border: ...` shorthand junto com `borderBottom: ...`
  (gera warning em rerender).

---

## Rotina de teste manual

Antes de subir mudanças, vale rodar:

```bash
npx tsc --noEmit                # type-check
npx next build                  # smoke test do build
```

E manualmente:
1. Login → criar projeto de saneamento
2. Mover etapa pra "Em andamento"
3. Criar tarefa em uma etapa
4. Iniciar cronômetro, pausar, finalizar
5. Adicionar registro de diário na tarefa (categoria "bloqueio")
6. Cadastrar uma aprovação externa
7. Anexar uma revisão (R0 → R1)
8. Cadastrar uma ART

---

## Próximos passos planejados

Em ordem de prioridade. Veja o histórico de conversas pro contexto.

1. Notificações por e-mail (Supabase Edge Functions + Resend/Postmark)
2. Storage de arquivos (anexos em revisões e diário)
3. Custo/hora por usuário → custo do projeto
4. PDF executivo de 1 página por projeto
5. Auth no servidor (middleware + `@supabase/ssr`)
6. Multi-tenant (organizations)
7. Templates de projeto saneamento
8. Tracker de validade de licenças/outorgas
9. Tests Playwright dos 5 fluxos críticos
