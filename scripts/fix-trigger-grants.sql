-- Re-create handle_new_user with explicit search_path and add supabase_auth_admin grants
-- as a belt-and-suspenders fix in case SECURITY DEFINER alone isn't enough.

GRANT INSERT, SELECT, UPDATE ON public.profiles TO supabase_auth_admin;

-- Make handle_new_user extra-safe with explicit search_path.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
    BEGIN
      INSERT INTO public.profiles (id, email, full_name, role)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'tourist')
      );
      RETURN NEW;
    END;
    $function$
;
