-- Prevent deleting superadmin profiles via authenticated clients.
-- Service-role deletes are still blocked in deleteUserAction.

DROP POLICY IF EXISTS "Delete profiles" ON public.user_profiles;

CREATE POLICY "Delete profiles"
    ON public.user_profiles FOR DELETE TO authenticated
    USING (
        public.is_superadmin()
        AND role IS DISTINCT FROM 'superadmin'
    );
