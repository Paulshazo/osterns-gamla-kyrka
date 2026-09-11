-- Endast superadmin får ändra logotyp, inloggningstexter och Resend.
-- Org-admin och vanliga användare kan fortfarande läsa (inloggningssidan behöver det).
-- Idempotent.

DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Superadmins can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Superadmins can insert settings" ON public.app_settings;

CREATE POLICY "Superadmins can update settings"
    ON public.app_settings FOR UPDATE TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

CREATE POLICY "Superadmins can insert settings"
    ON public.app_settings FOR INSERT TO authenticated
    WITH CHECK (public.is_superadmin());
