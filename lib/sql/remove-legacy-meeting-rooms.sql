-- ============================================================================
-- HYDRACODE — REMOVER SALAS DE DEMO (Sala 01 / 02 / Sala de Reunião Principal)
-- ============================================================================
-- Remove do banco as salas legado com setor e capacidade fictícios, para ficar
-- só com as salas reais por andar (ver seed-meeting-rooms-salas-andares.sql).
--
-- Apaga também participantes e reuniões vinculadas a essas salas (evita FK e
-- sobra de eventos órfãos). Se precisar preservar reuniões, comente os DELETEs
-- de meetings/meeting_participants e ajuste room_id manualmente.
--
-- Idempotente em relação aos nomes (pode rodar mais de uma vez).
-- Uso: Supabase → SQL Editor → Run.
-- ============================================================================

-- Participantes de reuniões nessas salas
DELETE FROM public.meeting_participants mp
WHERE mp.meeting_id IN (
  SELECT m.id
  FROM public.meetings m
  INNER JOIN public.meeting_rooms mr ON mr.id = m.room_id
  WHERE lower(trim(mr.name)) IN (
    'sala 01',
    'sala 02',
    'sala de reunião principal'
  )
);

-- Reuniões agendadas nessas salas
DELETE FROM public.meetings m
USING public.meeting_rooms mr
WHERE m.room_id = mr.id
  AND lower(trim(mr.name)) IN (
    'sala 01',
    'sala 02',
    'sala de reunião principal'
  );

-- Salas
DELETE FROM public.meeting_rooms
WHERE lower(trim(name)) IN (
  'sala 01',
  'sala 02',
  'sala de reunião principal'
);

-- Opcional: não exibir “X pessoas” em nenhuma sala (UI só mostra se capacity preenchido).
-- UPDATE public.meeting_rooms SET capacity = NULL WHERE capacity IS NOT NULL;
