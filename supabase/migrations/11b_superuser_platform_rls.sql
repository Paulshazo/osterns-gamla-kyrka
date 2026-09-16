-- =============================================================
-- STEP 2 of 2 — Run AFTER step 1 has succeeded.
-- Platform staff helpers + RLS for superuser (read-only monitor).
-- =============================================================

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid()
          AND role IN ('superadmin', 'superuser')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated;

DROP POLICY IF EXISTS "Users can view own organisations" ON public.organisations;
CREATE POLICY "Users can view own organisations"
    ON public.organisations FOR SELECT TO authenticated
    USING (
        id IN (SELECT organisation_id FROM public.organisation_members WHERE user_id = auth.uid())
        OR public.is_platform_staff()
    );

DROP POLICY IF EXISTS "View memberships" ON public.organisation_members;
CREATE POLICY "View memberships"
    ON public.organisation_members FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_org_admin(organisation_id)
        OR public.is_platform_staff()
    );

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['familjer','barn','betalningar','intakter','utgifter']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Org members can read', t);
        EXECUTE format(
            'CREATE POLICY "Org members can read" ON public.%I FOR SELECT TO authenticated
             USING (
                organisation_id IN (SELECT organisation_id FROM public.organisation_members WHERE user_id = auth.uid())
                OR public.is_platform_staff()
             )',
            t
        );
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() = p_user_id
    OR public.is_platform_staff()
    OR EXISTS (
        SELECT 1
        FROM public.organisation_members mine
        JOIN public.organisation_members theirs
          ON theirs.organisation_id = mine.organisation_id
        WHERE mine.user_id = auth.uid()
          AND COALESCE(mine.is_active, true) = true
          AND theirs.user_id = p_user_id
          AND public.is_org_admin(mine.organisation_id)
    );
$$;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (
        public.is_platform_staff()
        OR (organisation_id IS NOT NULL AND public.is_org_admin(organisation_id))
    );

DROP POLICY IF EXISTS "Delete profiles" ON public.user_profiles;
CREATE POLICY "Delete profiles"
    ON public.user_profiles FOR DELETE TO authenticated
    USING (
        public.is_superadmin()
        AND role IS DISTINCT FROM 'superadmin'
    );
