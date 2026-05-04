# Checklist de Apresentacao Premium

## 1) Checklist tecnico (antes da reuniao)

- [ ] Rodar no Supabase SQL Editor (nesta ordem):
  - [ ] `lib/sql/meetings-extra-fields.sql`
  - [ ] `lib/sql/auth-link-fallback.sql`
  - [ ] `lib/sql/fix-auth-link.sql`
  - [ ] `lib/sql/permissions.sql`
- [ ] Fazer logout/login em todas as contas de teste depois dos SQLs.
- [ ] Validar com 2 perfis: `admin` e `projetista`.
- [ ] Testar criacao de reuniao (com participantes e lembrete de 15min).
- [ ] Testar chat em 2 usuarios:
  - [ ] envio/recebimento em tempo real
  - [ ] notificacao nativa com aba minimizada
  - [ ] silenciar grupo
- [ ] Testar tarefas:
  - [ ] projetista nao pausa tarefa de terceiros
  - [ ] admin/coordinator/projetista legado conseguem pausar de terceiros
  - [ ] pausa exige motivo
- [ ] Testar ponto:
  - [ ] clock-out pausa tarefa ativa automaticamente
  - [ ] clock-in no dia seguinte retoma tarefa automaticamente
- [ ] Conferir que o dashboard abre sem warning de grafico no console.

## 2) Checklist de dados para demo

- [ ] 1 projeto com nome de cliente realista (ex.: "Residencial Aurora").
- [ ] 1 projeto de saneamento com fases e aprovacoes abertas.
- [ ] 6-10 tarefas distribuidas (pendente, em andamento, concluida, atrasada).
- [ ] 2 reunioes no calendario (uma hoje, uma amanha).
- [ ] Chat com historico de mensagens coerente.
- [ ] 3 usuarios visiveis (admin, coordenador, projetista).

## 3) Checklist de apresentacao

- [ ] Abrir sistema 10 minutos antes.
- [ ] Limpar abas desnecessarias do navegador.
- [ ] Deixar login ja feito com conta `admin`.
- [ ] Deixar uma aba pronta com conta `projetista` (janela separada).
- [ ] Testar internet e audio.
- [ ] Ter backup: video curto de 60-90s gravado da demo.

---

# Roteiro de apresentacao (10-12 minutos)

## 1. Abertura (1 min)

> "Hoje vou mostrar como o Hydra centraliza operacao de projetos, tarefas, reunioes, ponto e comunicacao em um unico fluxo, com controle de permissao por perfil."

## 2. Dor do cliente (1 min)

> "Normalmente essas informacoes ficam espalhadas em planilhas, chat e agenda separada. Isso gera atraso, retrabalho e pouca visibilidade para gestao."

## 3. Visao executiva (Dashboard) (2 min)

- Mostrar indicadores principais:
  - produtividade
  - tarefas atrasadas
  - saude das entregas
- Mostrar destaque de saneamento e leitura rapida de risco.

Frase sugerida:
> "Em menos de 30 segundos, a diretoria sabe onde agir hoje."

## 4. Operacao (Projetos + Tarefas) (3 min)

- Entrar em `Projetos`, abrir um projeto.
- Mostrar tarefas com timer, pausa com motivo e status.
- Mostrar regra de permissao:
  - projetista nao altera tarefa de outro responsavel.

Frase sugerida:
> "A regra operacional impede alteracoes indevidas e aumenta a rastreabilidade."

## 5. Comunicacao e reunioes (2 min)

- No `Chat`, enviar mensagem de uma conta e receber na outra (tempo real + pop-up).
- No `Calendario`, criar reuniao com participantes e lembrar de 15 min.

Frase sugerida:
> "Comunicacao e agenda viram parte do fluxo operacional, nao ferramentas isoladas."

## 6. Ponto integrado a producao (1.5 min)

- Mostrar clock-out pausando automaticamente tarefa ativa.
- Mostrar clock-in no dia seguinte retomando tarefa.

Frase sugerida:
> "A gestao de tempo conversa direto com a execucao das tarefas."

## 7. Fechamento (1 min)

> "Em resumo: menos retrabalho, mais previsibilidade e uma operacao com governanca por perfil. Se fizer sentido, o proximo passo pode ser um piloto com um time da empresa."

---

# Perguntas que provavelmente vao fazer (e respostas curtas)

## "Consigo controlar quem pode alterar o que?"
Sim. A plataforma usa regras por perfil (admin, coordenador, projetista etc.) e valida tambem no banco.

## "Tem notificacao mesmo com tela minimizada?"
Sim, com permissao do navegador ativa, o chat e reunioes disparam notificacoes nativas.

## "Da para comecar pequeno?"
Sim. Pode iniciar com 1 area/time e expandir por etapas.

## "Consegue adaptar ao nosso processo?"
Sim. O sistema ja esta estruturado para ajustes de regra, campos e fluxos por operacao.
