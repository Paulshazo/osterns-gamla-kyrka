-- =============================================================
-- Add "superuser" (Super användare): platform viewer role.
-- Sees all orgs like superadmin but cannot mutate data.
-- Platform accounts (superadmin/superuser) are not org members.
-- =============================================================

DO $$ BEGIN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'superuser';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

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

-- Organisations: platform staff can view all; only superadmin manages
DROP POLICY IF EXISTS "Users can view own organisations" ON public.organisations;
CREATE POLICY "Users can view own organisations"
    ON public.organisations FOR SELECT TO authenticated
    USING (
        id IN (SELECT organisation_id FROM public.organisation_members WHERE user_id = auth.uid())
        OR public.is_platform_staff()
    );

-- Memberships: platform staff can view all memberships (monitor)
DROP POLICY IF EXISTS "View memberships" ON public.organisation_members;
CREATE POLICY "View memberships"
    ON public.organisation_members FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR public.is_org_admin(organisation_id)
        OR public.is_platform_staff()
    );

-- Data tables: allow superuser SELECT (monitor), keep writes for superadmin/members
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

-- Profiles: platform staff can view all profiles (for Super Admin user list)
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

-- Audit logs: platform staff can view
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (
        public.is_platform_staff()
        OR (organisation_id IS NOT NULL AND public.is_org_admin(organisation_id))
    );

-- Protect superuser profiles from deletion by non-superadmins (app also enforces)
DROP POLICY IF EXISTS "Delete profiles" ON public.user_profiles;
CREATE POLICY "Delete profiles"
    ON public.user_profiles FOR DELETE TO authenticated
    USING (
        public.is_superadmin()
        AND role IS DISTINCT FROM 'superadmin'
    );
