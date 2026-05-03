-- ============================================================================
-- HYDRACODE — FALLBACK DE IDENTIDADE POR E-MAIL
-- ============================================================================
-- Objetivo:
-- Corrigir cenários em que o usuário consegue autenticar, mas a coluna
-- users.auth_user_id ainda não foi vinculada. Nesses casos, funções de RLS
-- retornavam NULL e bloqueavam chat/reuniões para esse usuário.
--
-- Estratégia:
-- - Primeiro tenta match por auth_user_id = auth.uid()
-- - Se não existir, faz fallback por e-mail do token (auth.jwt()->>'email')
--   priorizando linhas com auth_user_id NULL.
--
-- IDEMPOTENTE: pode rodar múltiplas vezes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE
    u.auth_user_id = auth.uid()
    OR (
      u.auth_user_id IS NULL
      AND LOWER(u.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.role
  FROM public.users u
  WHERE
    u.auth_user_id = auth.uid()
    OR (
      u.auth_user_id IS NULL
      AND LOWER(u.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
  ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1;
$$;
