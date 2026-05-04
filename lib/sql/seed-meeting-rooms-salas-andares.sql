-- ============================================================================
-- HYDRACODE — SALAS DA ABA CALENDÁRIO / REUNIÕES (ANDARES)
-- ============================================================================
-- Insere salas físicas nomeadas como no prédio, sem capacidade nem local extra
-- (capacity e location ficam NULL — a UI só mostra "X pessoas" se capacity
-- vier preenchido).
--
-- Pré-requisito: tabela public.meeting_rooms existir (migration base do projeto).
-- Idempotente: não duplica registros quando o mesmo nome já existe (comparação
-- case-insensitive nos espaços extras).
--
-- Uso: Supabase → SQL Editor → colar → Run.
--
-- Para remover salas de demo antigas (Sala 01, 02, Sala de Reunião Principal),
-- rode também: lib/sql/remove-legacy-meeting-rooms.sql
-- ============================================================================

INSERT INTO public.meeting_rooms (name, location, capacity, is_active)
SELECT v.name,
       NULL::TEXT,
       NULL::INT,
       TRUE
FROM (
  VALUES
    ('12° ANDAR'),
    ('3° ANDAR - YKS'),
    ('4° ANDAR'),
    ('5° ANDAR'),
    ('6° ANDAR'),
    ('8° ANDAR')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.meeting_rooms mr
  WHERE lower(trim(mr.name)) = lower(trim(v.name))
);
