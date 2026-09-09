-- =============================================================
-- Avdelningsbehörighet: se allt, redigera bara sitt ansvar.
-- Superadmin: alla organisationer.
-- Org-admin: användare, inställningar och loggar i sin org.
-- Vanlig användare: ingen inställning / användare / loggar.
-- Idempotent. Data raderas inte.
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

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_superadmin()
    OR EXISTS (
        SELECT 1 FROM public.organisation_members
        WHERE user_id = auth.uid()
          AND organisation_id = p_org_id
          AND role = 'admin'
          AND COALESCE(is_active, true) = true
    )
    OR EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = auth.uid()
          AND up.role = 'admin'
          AND EXISTS (
              SELECT 1 FROM public.organisation_members om
              WHERE om.user_id = auth.uid()
                AND om.organisation_id = p_org_id
                AND COALESCE(om.is_active, true) = true
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_section(p_org_id uuid, p_section text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_superadmin()
    OR public.is_org_admin(p_org_id)
    OR EXISTS (
        SELECT 1 FROM public.organisation_members
        WHERE user_id = auth.uid()
          AND organisation_id = p_org_id
          AND COALESCE(is_active, true) = true
          AND permissions IS NOT NULL
          AND jsonb_typeof(permissions) = 'array'
          AND permissions ? p_section
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(p_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() = p_user_id
    OR public.is_superadmin()
    OR EXISTS (
        SELECT 1
        FROM public.organisation_members mine
        JOIN public.organisation_members theirs
          ON theirs.organisation_id = mine.organisation_id
        WHERE mine.user_id = auth.uid()
          AND mine.role IN ('admin', 'superadmin')
          AND COALESCE(mine.is_active, true) = true
          AND theirs.user_id = p_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_profile(p_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_superadmin()
    OR (
        NOT EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = p_user_id AND role = 'superadmin'
        )
        AND EXISTS (
            SELECT 1
            FROM public.organisation_members mine
            JOIN public.organisation_members theirs
              ON theirs.organisation_id = mine.organisation_id
            WHERE mine.user_id = auth.uid()
              AND COALESCE(mine.is_active, true) = true
              AND theirs.user_id = p_user_id
              AND public.is_org_admin(mine.organisation_id)
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_section(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_profile(uuid) TO authenticated;

-- organisation_members: org-admin ser och hanterar sin församling
DROP POLICY IF EXISTS "Users can view own memberships" ON public.organisation_members;
DROP POLICY IF EXISTS "Superadmins manage memberships" ON public.organisation_members;
DROP POLICY IF EXISTS "View memberships" ON public.organisation_members;
DROP POLICY IF EXISTS "Admins insert memberships" ON public.organisation_members;
DROP POLICY IF EXISTS "Admins update memberships" ON public.organisation_members;
DROP POLICY IF EXISTS "Admins delete memberships" ON public.organisation_members;

CREATE POLICY "View memberships"
    ON public.organisation_members FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_org_admin(organisation_id));

CREATE POLICY "Admins insert memberships"
    ON public.organisation_members FOR INSERT TO authenticated
    WITH CHECK (public.is_org_admin(organisation_id));

CREATE POLICY "Admins update memberships"
    ON public.organisation_members FOR UPDATE TO authenticated
    USING (public.is_org_admin(organisation_id))
    WITH CHECK (public.is_org_admin(organisation_id));

CREATE POLICY "Admins delete memberships"
    ON public.organisation_members FOR DELETE TO authenticated
    USING (public.is_org_admin(organisation_id));

-- Skrivrättigheter per avdelning (läsning oförändrad: alla i org kan se)
DROP POLICY IF EXISTS "Org members can insert" ON public.familjer;
DROP POLICY IF EXISTS "Org members can update" ON public.familjer;
DROP POLICY IF EXISTS "Org members can delete" ON public.familjer;
CREATE POLICY "Editors can insert" ON public.familjer FOR INSERT TO authenticated
    WITH CHECK (public.can_edit_section(organisation_id, 'register'));
CREATE POLICY "Editors can update" ON public.familjer FOR UPDATE TO authenticated
    USING (public.can_edit_section(organisation_id, 'register'));
CREATE POLICY "Editors can delete" ON public.familjer FOR DELETE TO authenticated
    USING (public.can_edit_section(organisation_id, 'register'));

DROP POLICY IF EXISTS "Org members can insert" ON public.barn;
DROP POLICY IF EXISTS "Org members can update" ON public.barn;
DROP POLICY IF EXISTS "Org members can delete" ON public.barn;
CREATE POLICY "Editors can insert" ON public.barn FOR INSERT TO authenticated
    WITH CHECK (public.can_edit_section(organisation_id, 'register'));
CREATE POLICY "Editors can update" ON public.barn FOR UPDATE TO authenticated
    USING (public.can_edit_section(organisation_id, 'register'));
CREATE POLICY "Editors can delete" ON public.barn FOR DELETE TO authenticated
    USING (public.can_edit_section(organisation_id, 'register'));

DROP POLICY IF EXISTS "Org members can insert" ON public.betalningar;
DROP POLICY IF EXISTS "Org members can update" ON public.betalningar;
DROP POLICY IF EXISTS "Org members can delete" ON public.betalningar;
CREATE POLICY "Editors can insert" ON public.betalningar FOR INSERT TO authenticated
    WITH CHECK (public.can_edit_section(organisation_id, 'payments'));
CREATE POLICY "Editors can update" ON public.betalningar FOR UPDATE TO authenticated
    USING (public.can_edit_section(organisation_id, 'payments'));
CREATE POLICY "Editors can delete" ON public.betalningar FOR DELETE TO authenticated
    USING (public.can_edit_section(organisation_id, 'payments'));

DROP POLICY IF EXISTS "Org members can insert" ON public.intakter;
DROP POLICY IF EXISTS "Org members can update" ON public.intakter;
DROP POLICY IF EXISTS "Org members can delete" ON public.intakter;
CREATE POLICY "Editors can insert" ON public.intakter FOR INSERT TO authenticated
    WITH CHECK (public.can_edit_section(organisation_id, 'income'));
CREATE POLICY "Editors can update" ON public.intakter FOR UPDATE TO authenticated
    USING (public.can_edit_section(organisation_id, 'income'));
CREATE POLICY "Editors can delete" ON public.intakter FOR DELETE TO authenticated
    USING (public.can_edit_section(organisation_id, 'income'));

DROP POLICY IF EXISTS "Org members can insert" ON public.utgifter;
DROP POLICY IF EXISTS "Org members can update" ON public.utgifter;
DROP POLICY IF EXISTS "Org members can delete" ON public.utgifter;
CREATE POLICY "Editors can insert" ON public.utgifter FOR INSERT TO authenticated
    WITH CHECK (public.can_edit_section(organisation_id, 'expenses'));
CREATE POLICY "Editors can update" ON public.utgifter FOR UPDATE TO authenticated
    USING (public.can_edit_section(organisation_id, 'expenses'));
CREATE POLICY "Editors can delete" ON public.utgifter FOR DELETE TO authenticated
    USING (public.can_edit_section(organisation_id, 'expenses'));

-- Inställningar: bara org-admin / superadmin
DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
CREATE POLICY "Admins can update settings"
    ON public.app_settings FOR UPDATE TO authenticated
    USING (public.is_org_admin(organisation_id));
CREATE POLICY "Admins can insert settings"
    ON public.app_settings FOR INSERT TO authenticated
    WITH CHECK (public.is_org_admin(organisation_id));

-- Loggar: org-admin ser sin församling, superadmin ser allt
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (
        public.is_superadmin()
        OR (organisation_id IS NOT NULL AND public.is_org_admin(organisation_id))
    );

-- user_profiles: org-admin ser bara användare i sina organisationer
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'user_profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_profiles', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "View profiles"
    ON public.user_profiles FOR SELECT TO authenticated
    USING (public.can_view_profile(id));

CREATE POLICY "Manage profiles"
    ON public.user_profiles FOR UPDATE TO authenticated
    USING (public.can_manage_profile(id))
    WITH CHECK (public.can_manage_profile(id));

CREATE POLICY "Insert profiles"
    ON public.user_profiles FOR INSERT TO authenticated, service_role
    WITH CHECK (public.is_superadmin() OR auth.role() = 'service_role');

CREATE POLICY "Delete profiles"
    ON public.user_profiles FOR DELETE TO authenticated
    USING (public.is_superadmin());

-- RPC: tvinga registerbehörighet (SECURITY DEFINER kringgår annars RLS)
CREATE OR REPLACE FUNCTION public.add_family_with_children(
    family_data JSONB,
    children_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_family_id UUID;
    child_data JSONB;
    v_org_id UUID;
BEGIN
    v_org_id := COALESCE(
        (family_data->>'organisation_id')::UUID,
        get_current_org_id()
    );

    IF v_org_id IS NULL OR NOT public.can_edit_section(v_org_id, 'register') THEN
        RAISE EXCEPTION 'Inte behörig att redigera registret';
    END IF;

    INSERT INTO familjer (
        familje_namn, make_namn, make_personnummer, make_manads_avgift,
        hustru_namn, hustru_personnummer, hustru_manads_avgift,
        mobil_nummer, mail, adress, ort, post_kod, land,
        organisation_id
    ) VALUES (
        family_data->>'familje_namn',
        family_data->>'make_namn',
        NULLIF(family_data->>'make_personnummer', ''),
        COALESCE((family_data->>'make_manads_avgift')::INTEGER, 200),
        family_data->>'hustru_namn',
        NULLIF(family_data->>'hustru_personnummer', ''),
        COALESCE((family_data->>'hustru_manads_avgift')::INTEGER, 200),
        family_data->>'mobil_nummer',
        family_data->>'mail',
        family_data->>'adress',
        family_data->>'ort',
        family_data->>'post_kod',
        COALESCE(family_data->>'land', 'Sverige'),
        v_org_id
    ) RETURNING id INTO new_family_id;

    IF children_data IS NOT NULL AND jsonb_typeof(children_data) = 'array' THEN
        FOR child_data IN SELECT * FROM jsonb_array_elements(children_data)
        LOOP
            IF child_data->>'namn' IS NOT NULL AND child_data->>'namn' != '' THEN
                INSERT INTO barn (familj_id, ordning, namn, personnummer, manads_avgift, organisation_id)
                VALUES (
                    new_family_id,
                    COALESCE((child_data->>'ordning')::INTEGER, 1),
                    child_data->>'namn',
                    NULLIF(child_data->>'personnummer', ''),
                    COALESCE((child_data->>'manads_avgift')::INTEGER, 100),
                    v_org_id
                );
            END IF;
        END LOOP;
    END IF;

    RETURN new_family_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_family_with_children(
    p_family_id UUID,
    family_data JSONB,
    children_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    child_data JSONB;
    v_exists BOOLEAN;
    v_org_id UUID;
BEGIN
    SELECT EXISTS(SELECT 1 FROM familjer WHERE id = p_family_id) INTO v_exists;
    IF NOT v_exists THEN
        RAISE EXCEPTION 'Family with id % not found', p_family_id;
    END IF;

    SELECT organisation_id INTO v_org_id FROM familjer WHERE id = p_family_id;

    IF v_org_id IS NULL OR NOT public.can_edit_section(v_org_id, 'register') THEN
        RAISE EXCEPTION 'Inte behörig att redigera registret';
    END IF;

    UPDATE familjer SET
        familje_namn         = family_data->>'familje_namn',
        make_namn            = family_data->>'make_namn',
        make_personnummer    = NULLIF(family_data->>'make_personnummer', ''),
        make_manads_avgift   = COALESCE((family_data->>'make_manads_avgift')::INTEGER, 200),
        hustru_namn          = family_data->>'hustru_namn',
        hustru_personnummer  = NULLIF(family_data->>'hustru_personnummer', ''),
        hustru_manads_avgift = COALESCE((family_data->>'hustru_manads_avgift')::INTEGER, 200),
        mobil_nummer         = family_data->>'mobil_nummer',
        mail                 = family_data->>'mail',
        adress               = family_data->>'adress',
        ort                  = family_data->>'ort',
        post_kod             = family_data->>'post_kod',
        land                 = COALESCE(family_data->>'land', 'Sverige')
    WHERE id = p_family_id;

    DELETE FROM barn WHERE familj_id = p_family_id;

    IF children_data IS NOT NULL AND jsonb_typeof(children_data) = 'array' THEN
        FOR child_data IN SELECT * FROM jsonb_array_elements(children_data)
        LOOP
            IF child_data->>'namn' IS NOT NULL AND child_data->>'namn' != '' THEN
                INSERT INTO barn (familj_id, ordning, namn, personnummer, manads_avgift, organisation_id)
                VALUES (
                    p_family_id,
                    COALESCE((child_data->>'ordning')::INTEGER, 1),
                    child_data->>'namn',
                    NULLIF(child_data->>'personnummer', ''),
                    COALESCE((child_data->>'manads_avgift')::INTEGER, 100),
                    v_org_id
                );
            END IF;
        END LOOP;
    END IF;
END;
$$;
