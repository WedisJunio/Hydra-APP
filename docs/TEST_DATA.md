# Dados de Teste - Sistema de Perfil de Usuário

## 📊 Como Popular Dados de Teste

Se você quer testar o sistema de perfil sem dados reais, siga este guia para criar dados de teste.

## 🔌 Pré-requisito

Certifique-se de ter executado as migrations:
1. ✅ `lib/sql/extend-user-profiles.sql`
2. ✅ `lib/sql/messages-schema.sql`
3. ✅ `lib/sql/permissions.sql`

## 📝 Criar Usuários de Teste

Execute este SQL no Supabase Studio para criar 5 usuários com perfis completos:

```sql
-- ============================================================================
-- DADOS DE TESTE - USUÁRIOS COM PERFIS COMPLETOS
-- ============================================================================

-- Usuário 1: Ana Silva - Gerente de Projetos
INSERT INTO public.users (id, auth_user_id, email, name, role, is_active, full_name, job_title, department, bio, phone, address, floor_number, date_of_birth, photo_url, linkedin_url, availability_status, work_start_time, work_end_time, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'ana.silva@empresa.com',
  'Ana Silva',
  'manager',
  true,
  'Ana Costa Silva',
  'Gerente de Projetos',
  'Gestão de Projetos',
  'Profissional dedicada com 8 anos de experiência em gestão de projetos de infraestrutura. Especializada em planejamento estratégico e liderança de equipes multidisciplinares.',
  '+55 11 98765-4321',
  'Av. Paulista, 1000 - São Paulo, SP',
  3,
  '1985-03-15',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana',
  'https://linkedin.com/in/anasilva',
  'available',
  '09:00',
  '18:00',
  NOW()
);

-- Usuário 2: Carlos Oliveira - Desenvolvedor Senior
INSERT INTO public.users (id, auth_user_id, email, name, role, is_active, full_name, job_title, department, bio, phone, address, floor_number, date_of_birth, photo_url, linkedin_url, availability_status, work_start_time, work_end_time, created_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  'carlos.oliveira@empresa.com',
  'Carlos Oliveira',
  'leader',
  true,
  'Carlos Henrique Oliveira',
  'Desenvolvedor Senior',
  'Tecnologia',
  'Engenheiro de software com foco em arquitetura de sistemas. Apaixonado por code quality e boas práticas de desenvolvimento.',
  '+55 11 91234-5678',
  'Rua Augusta, 2500 - São Paulo, SP',
  2,
  '1990-07-22',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos',
  'https://linkedin.com/in/carlosoliveira',
  'busy',
  '08:30',
  '17:30',
  NOW()
);

-- Usuário 3: Marina Costa - Coordenadora de Saneamento
INSERT INTO public.users (id, auth_user_id, email, name, role, is_active, full_name, job_title, department, bio, phone, address, floor_number, date_of_birth, photo_url, linkedin_url, availability_status, work_start_time, work_end_time, created_at)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333333',
  'marina.costa@empresa.com',
  'Marina Costa',
  'coordinator',
  true,
  'Marina Souza Costa',
  'Coordenadora de Saneamento',
  'Saneamento',
  'Profissional responsável pela coordenação de projetos de saneamento ambiental e infraestrutura sanitária. Experiência em gestão de programas municipais.',
  '+55 11 98888-9999',
  'Rua do Comércio, 150 - São Paulo, SP',
  3,
  '1992-11-08',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Marina',
  'https://linkedin.com/in/marinacosta',
  'available',
  '09:00',
  '18:00',
  NOW()
);

-- Usuário 4: Pedro Santos - Colaborador
INSERT INTO public.users (id, auth_user_id, email, name, role, is_active, full_name, job_title, department, bio, phone, address, floor_number, date_of_birth, photo_url, linkedin_url, availability_status, work_start_time, work_end_time, created_at)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '44444444-4444-4444-4444-444444444444',
  'pedro.santos@empresa.com',
  'Pedro Santos',
  'employee',
  true,
  'Pedro Rodrigues Santos',
  'Analista de Sistemas',
  'Tecnologia',
  'Analista de sistemas com 4 anos de experiência. Trabalho com tecnologias modernas e estou sempre buscando aprender coisas novas.',
  '+55 11 97777-6666',
  'Av. Brasil, 500 - São Paulo, SP',
  2,
  '1998-05-30',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Pedro',
  'https://linkedin.com/in/pedrosantos',
  'away',
  '09:00',
  '18:00',
  NOW()
);

-- Usuário 5: Juliana Ferreira - Assistente Administrativo
INSERT INTO public.users (id, auth_user_id, email, name, role, is_active, full_name, job_title, department, bio, phone, address, floor_number, date_of_birth, photo_url, linkedin_url, availability_status, work_start_time, work_end_time, created_at)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  '55555555-5555-5555-5555-555555555555',
  'juliana.ferreira@empresa.com',
  'Juliana Ferreira',
  'employee',
  true,
  'Juliana Alves Ferreira',
  'Assistente Administrativo',
  'Administração',
  'Assistente administrativa responsável pelo suporte administrativo aos projetos. Organizada e comprometida com prazos.',
  '+55 11 99999-8888',
  'Rua Teodoro Sampaio, 200 - São Paulo, SP',
  3,
  '1996-09-12',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Juliana',
  'https://linkedin.com/in/julianaferreira',
  'offline',
  '09:00',
  '18:00',
  NOW()
);

-- ============================================================================
-- MENSAGENS DE TESTE
-- ============================================================================

-- Mensagem 1: Ana para Carlos
INSERT INTO public.messages (sender_id, recipient_id, content, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Olá Carlos! Podemos agendar uma reunião para discutir a arquitetura do novo projeto?',
  NOW() - INTERVAL '2 hours'
);

-- Mensagem 2: Carlos para Ana
INSERT INTO public.messages (sender_id, recipient_id, content, created_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Claro, Ana! Estou disponível amanhã à tarde.',
  NOW() - INTERVAL '1 hour'
);

-- Mensagem 3: Marina para Pedro
INSERT INTO public.messages (sender_id, recipient_id, content, created_at)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  'Pedro, você pode revisar o relatório do projeto de saneamento?',
  NOW() - INTERVAL '30 minutes'
);

COMMIT;
```

## 🎯 Verificar Dados Inseridos

Execute estes queries para verificar que os dados foram inseridos corretamente:

### Listar Todos os Usuários
```sql
SELECT id, name, email, job_title, department, availability_status 
FROM public.users 
ORDER BY created_at;
```

**Esperado:** 5 usuários com perfis completos

---

### Listar Usuários por Departamento
```sql
SELECT name, job_title, department 
FROM public.users 
WHERE department = 'Tecnologia'
ORDER BY name;
```

**Esperado:** Carlos Oliveira e Pedro Santos

---

### Listar Mensagens
```sql
SELECT 
  (SELECT name FROM public.users WHERE id = messages.sender_id) as "De",
  (SELECT name FROM public.users WHERE id = messages.recipient_id) as "Para",
  content,
  created_at
FROM public.messages 
ORDER BY created_at DESC;
```

**Esperado:** 3 mensagens

---

### Usuários por Andar
```sql
SELECT name, floor_number, address 
FROM public.users 
WHERE floor_number IS NOT NULL
ORDER BY floor_number, name;
```

**Esperado:** 
- Andar 2: Carlos Oliveira, Pedro Santos
- Andar 3: Ana Silva, Marina Costa, Juliana Ferreira

---

## 🧪 Testar a Aplicação

### Teste 1: Visualizar Lista de Usuários
1. Acesse: http://localhost:3001/users
2. **Esperado:** Listar 5 usuários
3. Clique em qualquer linha para abrir o perfil

---

### Teste 2: Visualizar Perfil Completo
1. Clique no perfil de **Ana Silva**
2. **Esperado:**
   - ✅ Foto no topo
   - ✅ Nome "Ana Silva" com status disponível (verde)
   - ✅ Cargo: "Gerente de Projetos"
   - ✅ Departamento: "Gestão de Projetos"

---

### Teste 3: Navegar pelas Abas
1. No perfil de Ana Silva, teste cada aba:

**Aba "Visão Geral"**
- ✅ Bio completa
- ✅ Contato: email, telefone, endereço, LinkedIn
- ✅ Disponibilidade: "Disponível" com horários 09:00-18:00

**Aba "Cargo"**
- ✅ Cargo: "Gerente de Projetos"
- ✅ Departamento: "Gestão de Projetos"
- ✅ Nível: "Gerente"
- ✅ Data de entrada: data atual

**Aba "Idade"**
- ✅ Idade: 39 anos (nascida em 1985)
- ✅ Data de nascimento: 15/03/1985
- ✅ Próximo aniversário destacado

**Aba "Andar"**
- ✅ Andar 3
- ✅ Endereço: "Av. Paulista, 1000 - São Paulo, SP"
- ✅ Colegas no andar: Marina Costa, Juliana Ferreira (2 colegas)

**Aba "Departamento"**
- ✅ Departamento: "Gestão de Projetos"
- ✅ Responsável: Ana Silva (manager)
- ✅ 1 membro no departamento

---

### Teste 4: Enviar Mensagem
1. No perfil de Carlos Oliveira, role para baixo
2. Na seção "Enviar Mensagem", digite: "Olá! Como você está?"
3. Clique em "Enviar"
4. **Esperado:** Toast de sucesso "Mensagem enviada com sucesso"

---

### Teste 5: Baixar Dados
1. No perfil de Marina Costa, role para baixo
2. Clique em "Baixar Dados"
3. **Esperado:** Download de arquivo `perfil-marina-costa-2026-05-02.json`
4. Abra o arquivo e verifique que contém:
   - perfil (id, nome, email, etc)
   - trabalho (cargo, departamento, etc)
   - contato (email, telefone, LinkedIn)
   - disponibilidade (status, horários)
   - pessoal (data nascimento, bio, etc)

---

### Teste 6: Departamento com Múltiplos Membros
1. Abra o perfil de **Pedro Santos** (Analista de Sistemas)
2. Vá para aba "Departamento"
3. **Esperado:**
   - Departamento: "Tecnologia"
   - Responsável: Carlos Oliveira (leader)
   - Membros: 
     - Carlos Oliveira (Desenvolvedor Senior)
     - Pedro Santos (Analista de Sistemas)

---

### Teste 7: Status de Disponibilidade
Compare os perfis e seus status:
- **Ana Silva:** Disponível (🟢)
- **Carlos Oliveira:** Ocupado (🟡)
- **Marina Costa:** Disponível (🟢)
- **Pedro Santos:** Ausente (🔵)
- **Juliana Ferreira:** Offline (⚫)

---

## 🧹 Limpar Dados de Teste

Se quiser remover os dados de teste:

```sql
-- Remover mensagens de teste
DELETE FROM public.messages 
WHERE sender_id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

-- Remover usuários de teste
DELETE FROM public.users 
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555'
);

COMMIT;
```

---

## 📋 Checklist de Testes

- [ ] 5 usuários aparecem na lista
- [ ] Cada perfil mostra todos os campos
- [ ] Todas as 5 abas funcionam
- [ ] Abas mostram informações corretas
- [ ] Botão "Enviar Mensagem" funciona
- [ ] Mensagens são salvas no banco
- [ ] Botão "Baixar Dados" funciona
- [ ] Arquivo JSON contém dados esperados
- [ ] Links de LinkedIn e email funcionam
- [ ] Colegas são listados corretamente por departamento/andar

---

## 🐛 Problemas Comuns

### Problema: Usuários não aparecem
- Verifique se as migrations foram executadas
- Execute `SELECT COUNT(*) FROM public.users;`

### Problema: Foto não aparece
- As imagens são do Dicebear (geradas automaticamente)
- Se preferir, atualize `photo_url` com URLs reais

### Problema: Mensagens não salvam
- Verifique se a tabela `messages` existe
- Execute: `SELECT COUNT(*) FROM public.messages;`

### Problema: Erro de permissão
- Verifique se as RLS policies foram aplicadas corretamente
- Execute: `SELECT * FROM pg_policies WHERE tablename = 'users';`

---

**Versão:** 1.0  
**Data:** 2026-05-02
