-- =============================================================
-- FIX: RLS infinite recursion on organisation_members
-- Data raderas inte. Policyer skrevs om så de inte läser sig själva.
-- Idempotent.
-- =============================================================

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND role = 'superadmin'
    );
$$;

CREATE OR REPLACE FUNCTION public.user_organisation_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organisation_id
    FROM public.organisation_members
    WHERE user_id = auth.uid()
      AND COALESCE(is_active, true) = true;
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_organisation_ids() TO authenticated;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
            'familjer','barn','betalningar','intakter','utgifter',
            'organisations','organisation_members','app_settings',
            'audit_logs'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- organisations
CREATE POLICY "Users can view own organisations"
    ON public.organisations FOR SELECT TO authenticated
    USING (id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());

CREATE POLICY "Superadmins manage organisations"
    ON public.organisations FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- organisation_members
CREATE POLICY "Users can view own memberships"
    ON public.organisation_members FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_superadmin());

CREATE POLICY "Superadmins manage memberships"
    ON public.organisation_members FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- familjer
CREATE POLICY "Org members can read" ON public.familjer FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can insert" ON public.familjer FOR INSERT TO authenticated
    WITH CHECK (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can update" ON public.familjer FOR UPDATE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can delete" ON public.familjer FOR DELETE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());

-- barn
CREATE POLICY "Org members can read" ON public.barn FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can insert" ON public.barn FOR INSERT TO authenticated
    WITH CHECK (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can update" ON public.barn FOR UPDATE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can delete" ON public.barn FOR DELETE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());

-- betalningar
CREATE POLICY "Org members can read" ON public.betalningar FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can insert" ON public.betalningar FOR INSERT TO authenticated
    WITH CHECK (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can update" ON public.betalningar FOR UPDATE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can delete" ON public.betalningar FOR DELETE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());

-- intakter
CREATE POLICY "Org members can read" ON public.intakter FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can insert" ON public.intakter FOR INSERT TO authenticated
    WITH CHECK (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can update" ON public.intakter FOR UPDATE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can delete" ON public.intakter FOR DELETE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());

-- utgifter
CREATE POLICY "Org members can read" ON public.utgifter FOR SELECT TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can insert" ON public.utgifter FOR INSERT TO authenticated
    WITH CHECK (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can update" ON public.utgifter FOR UPDATE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());
CREATE POLICY "Org members can delete" ON public.utgifter FOR DELETE TO authenticated
    USING (organisation_id IN (SELECT public.user_organisation_ids()) OR public.is_superadmin());

-- app_settings: public login page still needs to read
CREATE POLICY "Allow public read access to settings"
    ON public.app_settings FOR SELECT TO public USING (true);
CREATE POLICY "Admins can update settings"
    ON public.app_settings FOR UPDATE TO authenticated
    USING (public.is_superadmin() OR organisation_id IN (SELECT public.user_organisation_ids()));
CREATE POLICY "Admins can insert settings"
    ON public.app_settings FOR INSERT TO authenticated
    WITH CHECK (public.is_superadmin() OR organisation_id IN (SELECT public.user_organisation_ids()));
CREATE POLICY "Superadmins can delete settings"
    ON public.app_settings FOR DELETE TO authenticated
    USING (public.is_superadmin());

-- audit_logs
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (public.is_superadmin());
CREATE POLICY "Users can insert own audit logs"
    ON public.audit_logs FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
