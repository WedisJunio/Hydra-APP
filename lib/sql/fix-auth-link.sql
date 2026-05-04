-- ============================================================================
-- HYDRACODE — VINCULAR auth.users ↔ public.users
-- ============================================================================
-- Resolve o erro "Usuário não autenticado" que ocorre quando uma linha em
-- public.users não tem auth_user_id apontando para a auth.users do login.
--
-- COMO USAR (no SQL Editor do Supabase, na ordem):
-- 1. Roda o bloco DIAGNÓSTICO pra ver o estado atual
-- 2. Roda o FIX 1 (backfill por e-mail)
-- 3. Roda o FIX 2 (cria perfil pra quem só existe em auth.users)
-- 4. Roda o FIX 3 (promove você a admin) — TROQUE O E-MAIL
-- 5. Roda o TRIGGER (pra novos usuários virem com perfil automático)
-- 6. Roda o VERIFICAR no final pra conferir
-- ============================================================================


-- ─── DIAGNÓSTICO (rode separadamente, é só SELECT) ──────────────────────────
-- Descomente os SELECTs abaixo e rode pra ver o estado atual:

-- SELECT id, email, created_at FROM auth.users;
-- SELECT id, name, email, role, auth_user_id FROM public.users;
--
-- -- Auth users sem perfil:
-- SELECT au.id, au.email
-- FROM auth.users au
-- LEFT JOIN public.users pu
--   ON pu.auth_user_id = au.id OR LOWER(pu.email) = LOWER(au.email)
-- WHERE pu.id IS NULL;
--
-- -- Profiles órfãos (sem login Supabase Auth):
-- SELECT pu.id, pu.email, pu.role
-- FROM public.users pu
-- LEFT JOIN auth.users au ON LOWER(au.email) = LOWER(pu.email)
-- WHERE pu.auth_user_id IS NULL;


-- ─── FIX 1 — vincula public.users a auth.users por e-mail ──────────────────
-- Atualiza auth_user_id para os perfis em public.users que estão:
--   (a) com auth_user_id NULL, OU
--   (b) com auth_user_id apontando para um auth.users que não existe
--       (placeholders/fakes de seed antigo)

UPDATE public.users pu
SET auth_user_id = au.id
FROM auth.users au
WHERE LOWER(pu.email) = LOWER(au.email)
  AND (
    pu.auth_user_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM auth.users x WHERE x.id = pu.auth_user_id
    )
  );


-- ─── FIX 2 — cria perfil para quem está só em auth.users ──────────────────
-- Se você criou o usuário pelo Supabase Studio (Authentication → Users) sem
-- ter linha em public.users, este bloco cria automaticamente.

INSERT INTO public.users (
  auth_user_id,
  email,
  name,
  role,
  password_hash,
  is_active
)
SELECT
  au.id,
  au.email,
  COALESCE(
    au.raw_user_meta_data ->> 'name',
    SPLIT_PART(au.email, '@', 1)
  ),
  'projetista',
  'managed_by_supabase_auth',
  true
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu
  WHERE pu.auth_user_id = au.id
     OR LOWER(pu.email) = LOWER(au.email)
);


-- ─── FIX 3 — promove você a admin ──────────────────────────────────────────
-- TROQUE O E-MAIL ABAIXO PELO SEU antes de rodar:

UPDATE public.users
SET role = 'admin'
WHERE LOWER(email) = LOWER('seu-email@empresa.com');


-- ─── TRIGGER — perfil automático para novos cadastros ─────────────────────
-- A partir daqui, todo novo cadastro no Supabase Auth cria automaticamente
-- a linha em public.users já vinculada. Nunca mais precisa fazer fix manual.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    auth_user_id,
    email,
    name,
    role,
    password_hash,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', SPLIT_PART(NEW.email, '@', 1)),
    'projetista',
    'managed_by_supabase_auth',
    true
  )
  -- Se já existir um perfil com mesmo e-mail (criado antes do auth), só
  -- amarra o auth_user_id em vez de duplicar.
  ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id
    WHERE public.users.auth_user_id IS NULL;

  RETURN NEW;
END;
$$;

-- (Re)cria o trigger no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();


-- ─── VERIFICAR ─────────────────────────────────────────────────────────────
-- Depois de rodar tudo acima, este SELECT deve retornar pelo menos 1 linha
-- com seu e-mail e role = 'admin', com auth_user_id preenchido.

SELECT
  pu.id,
  pu.name,
  pu.email,
  pu.role,
  pu.auth_user_id,
  au.email AS auth_email,
  CASE
    WHEN pu.auth_user_id IS NULL THEN 'SEM LOGIN — não consegue autenticar'
    WHEN au.id IS NULL THEN 'auth_user_id INVÁLIDO'
    ELSE 'OK'
  END AS status
FROM public.users pu
LEFT JOIN auth.users au ON au.id = pu.auth_user_id
ORDER BY pu.role, pu.name;
-- ============================================================================
