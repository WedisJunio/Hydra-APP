-- ============================================================================
-- HYDRACODE — CAMPOS EXTRAS DE REUNIÃO
-- ============================================================================
-- Adiciona à tabela `meetings`:
--   reminder_minutes  : int    — lembrete em minutos antes (NULL = sem lembrete)
--   event_color       : text   — código #RRGGBB pra colorir o evento
--   availability      : text   — 'busy' | 'free' | 'tentative' | 'oof'
--   is_private        : bool   — evento privado (somente convidados)
--
-- IDEMPOTENTE.
-- ============================================================================

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS reminder_minutes INT;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS event_color TEXT;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS availability TEXT
    NOT NULL DEFAULT 'busy';

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN
    NOT NULL DEFAULT FALSE;

-- Garantir que availability tenha apenas valores válidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'meetings_availability_check'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_availability_check
        CHECK (availability IN ('busy', 'free', 'tentative', 'oof'));
  END IF;
END $$;

-- Garantir que reminder_minutes seja >= 0 quando preenchido.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'meetings_reminder_minutes_check'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_reminder_minutes_check
        CHECK (reminder_minutes IS NULL OR reminder_minutes >= 0);
  END IF;
END $$;
