# Guia de Execução das Migrations SQL

## 📌 Pré-requisitos
- Projeto Supabase criado e configurado
- Acesso ao Supabase Studio
- Permissão de admin no banco de dados

## 🔄 Ordem de Execução das Migrations

As migrations **DEVEM** ser executadas nesta ordem exata:

### 1️⃣ Estender Tabela de Usuários
**Arquivo:** `lib/sql/extend-user-profiles.sql`

Adiciona os novos campos ao perfil:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;
-- ... (e mais 11 campos)
```

**Campos adicionados:**
- full_name, job_title, department, bio, phone
- address, floor_number, date_of_birth, photo_url
- linkedin_url, availability_status, work_start_time
- work_end_time, updated_at

**Trigger criado:** Atualização automática de `updated_at` em modificações

---

### 2️⃣ Criar Tabela de Mensagens
**Arquivo:** `lib/sql/messages-schema.sql`

Cria a tabela para mensagens diretas e de projeto:
```sql
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id),
  recipient_id UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Indexes criados:**
- messages_sender_idx
- messages_recipient_idx
- messages_project_idx
- messages_created_at_idx

**Trigger criado:** Atualização automática de `updated_at`

---

### 3️⃣ Atualizar RLS Policies
**Arquivo:** `lib/sql/permissions.sql`

⚠️ **IMPORTANTE:** Este arquivo contém TODAS as políticas RLS do projeto.

**O que muda:**
- Mantém policies existentes para todas as tabelas
- **ATUALIZA** policies da tabela `messages` para suportar:
  - Mensagens de projeto (scoped por project_id)
  - Mensagens diretas entre usuários

**Novas políticas de mensagens:**
```sql
-- SELECT: Admin vê tudo; usuários veem suas mensagens
-- INSERT: Validação de sender_id e permissões de projeto
-- UPDATE: Apenas sender ou admin
-- DELETE: Apenas sender ou admin
```

---

## 📋 Como Executar no Supabase Studio

### Opção 1: Executar Uma Arquivo por Vez (Recomendado)

1. Abra [Supabase Studio](https://app.supabase.com)
2. Vá para **SQL Editor**
3. Para cada arquivo (em ordem):
   - Clique em **New Query**
   - Cole o conteúdo do arquivo
   - Clique em **Run**
   - Aguarde "Query executed successfully"

### Opção 2: Copiar Conteúdo Inteiro

Se preferir executar tudo de uma vez:

1. Copie o conteúdo completo de cada arquivo
2. Cole em uma **New Query**
3. Execute

⚠️ **Atenção:** Execute em ordem! Não combine os arquivos.

---

## ✅ Verificação Após Migrations

Para verificar se as migrations foram executadas com sucesso:

### Verificar Colunas da Tabela `users`
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

**Esperado:** Deve listar todos os campos incluindo:
- full_name, job_title, department, bio, phone
- address, floor_number, date_of_birth, photo_url
- linkedin_url, availability_status, work_start_time
- work_end_time, updated_at

---

### Verificar Existência da Tabela `messages`
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'messages'
);
```

**Esperado:** `true`

---

### Verificar Indexes da Tabela `messages`
```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'messages';
```

**Esperado:** Deve listar:
- messages_sender_idx
- messages_recipient_idx
- messages_project_idx
- messages_created_at_idx

---

### Verificar Funções Criadas
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_name LIKE 'update_%timestamp%';
```

**Esperado:** Deve listar:
- update_users_timestamp
- update_messages_timestamp

---

## 🐛 Troubleshooting

### Erro: "Table already exists"
Mensagem:
```
ERROR: relation "messages" already exists
```

**Solução:** 
- A migration já foi executada antes
- Execute a próxima migration ou pule para testes

---

### Erro: "Permission denied"
Mensagem:
```
ERROR: permission denied for schema public
```

**Solução:**
- Você não tem permissão de admin
- Peça ao admin do Supabase para executar as migrations

---

### Erro: "Column already exists"
Mensagem:
```
ERROR: column "job_title" of relation "users" already exists
```

**Solução:**
- O arquivo `extend-user-profiles.sql` já foi executado
- Prossiga com o próximo arquivo

---

### Erro: "RLS Policy already exists"
Mensagem:
```
ERROR: policy "messages_select" for table "messages" already exists
```

**Solução:**
- As policies já foram atualizadas
- Isso é normal se executar o arquivo `permissions.sql` mais de uma vez
- O arquivo foi projetado para ser idempotente (DROP IF EXISTS)

---

## 🔄 Rollback (Desfazer)

Se precisar reverter as mudanças:

### Remover Colunas de `users`
```sql
ALTER TABLE public.users
DROP COLUMN IF EXISTS full_name,
DROP COLUMN IF EXISTS job_title,
DROP COLUMN IF EXISTS department,
DROP COLUMN IF EXISTS bio,
DROP COLUMN IF EXISTS phone,
DROP COLUMN IF EXISTS address,
DROP COLUMN IF EXISTS floor_number,
DROP COLUMN IF EXISTS date_of_birth,
DROP COLUMN IF EXISTS photo_url,
DROP COLUMN IF EXISTS linkedin_url,
DROP COLUMN IF EXISTS availability_status,
DROP COLUMN IF EXISTS work_start_time,
DROP COLUMN IF EXISTS work_end_time,
DROP COLUMN IF EXISTS updated_at;

DROP FUNCTION IF EXISTS public.update_users_timestamp();
```

### Remover Tabela `messages`
```sql
DROP TABLE IF EXISTS public.messages CASCADE;
DROP FUNCTION IF EXISTS public.update_messages_timestamp();
```

---

## 📊 Próximas Verificações

Após executar as migrations, você pode testar:

### Teste 1: Inserir Usuário com Novo Campo
```sql
UPDATE public.users 
SET job_title = 'Desenvolvedor Full Stack'
WHERE id = 'seu-user-id';
```

### Teste 2: Criar Mensagem
```sql
INSERT INTO public.messages (sender_id, recipient_id, content)
VALUES (
  'sender-user-id', 
  'recipient-user-id',
  'Olá! Tudo bem?'
);
```

### Teste 3: Verificar RLS
```sql
SELECT * FROM public.messages LIMIT 1;
```

Se você é o sender ou recipient, conseguirá ver a mensagem. Caso contrário, a política RLS a ocultará.

---

## 🎯 Próximo Passo

Após completar as migrations:
1. ✅ Migrations executadas
2. ⏭️ **Próximo:** Testar a aplicação em http://localhost:3001/users

---

**Data de Criação:** 2026-05-02  
**Versão:** 1.0  
**Última Atualização:** 2026-05-02
