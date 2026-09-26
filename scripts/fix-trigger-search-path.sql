-- Set search_path to public so unqualified type casts like 'buddy'::user_role
-- resolve correctly. The function is SECURITY DEFINER owned by postgres,
-- which has full schema access.
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_catalog;
