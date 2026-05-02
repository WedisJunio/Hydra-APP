-- ============================================================================
-- HYDRACODE — Corrigir users_role_check (Coordenador, projetista, etc.)
-- ============================================================================
-- Erro: new row for relation 'users' violates check constraint 'users_role_check'
-- Rode no Supabase SQL Editor (uma vez). Idempotente.
-- ============================================================================

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      'admin',
      'manager',
      'coordinator',
      'leader',
      'employee',
      'projetista',
      'projetista_lider'
    )
  );
