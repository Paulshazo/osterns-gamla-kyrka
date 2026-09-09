-- =============================================================
-- MIGRATION: Multi-Tenant Support
-- Adds organisations, organisation_members, org_id columns,
-- and org-aware RLS policies.
-- All steps are idempotent (safe to run multiple times).
-- =============================================================

-- -----------------------------------------------
-- 1. Ny tabell: organisations
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    logo_url    TEXT,
    primary_color TEXT DEFAULT '#C9A84C',
    is_active   BOOLEAN DEFAULT true,
    created_by  UUID REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------
-- 2. Ny tabell: organisation_members
-- -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.organisation_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            public.user_role DEFAULT 'user',
    permissions     JSONB DEFAULT '[]',
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organisation_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_members_user_idx ON public.organisation_members(user_id);
CREATE INDEX IF NOT EXISTS org_members_org_idx  ON public.organisation_members(organisation_id);

ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------
-- 3. Lägg till organisation_id i befintliga tabeller
-- -----------------------------------------------
ALTER TABLE public.familjer     ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.barn         ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.betalningar  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.intakter     ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.utgifter     ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);
ALTER TABLE public.audit_logs   ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- -----------------------------------------------
-- 4. Skapa standard-organisation för befintlig data
-- -----------------------------------------------
INSERT INTO public.organisations (id, name, slug, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Huvudorganisation', 'main', true)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------
-- 5. Tilldela befintlig data till standard-org
-- -----------------------------------------------
UPDATE public.familjer    SET organisation_id = '00000000-0000-0000-0000-000000000001' WHERE organisation_id IS NULL;
UPDATE public.barn        SET organisation_id = '00000000-0000-0000-0000-000000000001' WHERE organisation_id IS NULL;
UPDATE public.betalningar SET organisation_id = '00000000-0000-0000-0000-000000000001' WHERE organisation_id IS NULL;
UPDATE public.intakter    SET organisation_id = '00000000-0000-0000-0000-000000000001' WHERE organisation_id IS NULL;
UPDATE public.utgifter    SET organisation_id = '00000000-0000-0000-0000-000000000001' WHERE organisation_id IS NULL;

-- -----------------------------------------------
-- 6. Gör NOT NULL efter migrering
-- -----------------------------------------------
ALTER TABLE public.familjer     ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.betalningar  ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.intakter     ALTER COLUMN organisation_id SET NOT NULL;
ALTER TABLE public.utgifter     ALTER COLUMN organisation_id SET NOT NULL;

-- -----------------------------------------------
-- 7. app_settings per organisation
-- -----------------------------------------------
ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

UPDATE public.app_settings
    SET organisation_id = '00000000-0000-0000-0000-000000000001'
    WHERE organisation_id IS NULL;

-- Add unique constraint for org settings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_org_unique'
    ) THEN
        ALTER TABLE public.app_settings
            ADD CONSTRAINT app_settings_org_unique UNIQUE(organisation_id);
    END IF;
END $$;

-- -----------------------------------------------
-- 8. Hjälpfunktion: get_current_org_id()
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_org_id', true), '')::UUID;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------
-- 9. Hjälpfunktion: is_org_admin()
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN AS $$
DECLARE v_role public.user_role;
BEGIN
    SELECT role INTO v_role FROM public.user_profiles WHERE id = auth.uid();
    IF v_role = 'superadmin' THEN RETURN true; END IF;
    SELECT role INTO v_role FROM public.organisation_members
        WHERE user_id = auth.uid() AND organisation_id = get_current_org_id();
    RETURN v_role IN ('admin', 'superadmin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------
-- 10. RPC: set_current_org
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION public.set_current_org(org_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_org_id', org_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------
-- 11. Uppdaterade RLS-policyer för org-medvetenhet
-- -----------------------------------------------

-- Drop old policies on data tables
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename, schemaname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename IN ('familjer', 'barn', 'betalningar', 'intakter', 'utgifter')
        AND policyname IN (
            'Allow authenticated read',
            'Allow authenticated insert',
            'Allow authenticated update',
            'Allow authenticated delete'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- Org-medvetna policyer för familjer
CREATE POLICY "Org members can read"
    ON public.familjer FOR SELECT TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can insert"
    ON public.familjer FOR INSERT TO authenticated
    WITH CHECK (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can update"
    ON public.familjer FOR UPDATE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can delete"
    ON public.familjer FOR DELETE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Org-medvetna policyer för barn
CREATE POLICY "Org members can read"
    ON public.barn FOR SELECT TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can insert"
    ON public.barn FOR INSERT TO authenticated
    WITH CHECK (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can update"
    ON public.barn FOR UPDATE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can delete"
    ON public.barn FOR DELETE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Org-medvetna policyer för betalningar
CREATE POLICY "Org members can read"
    ON public.betalningar FOR SELECT TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can insert"
    ON public.betalningar FOR INSERT TO authenticated
    WITH CHECK (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can update"
    ON public.betalningar FOR UPDATE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can delete"
    ON public.betalningar FOR DELETE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Org-medvetna policyer för intakter
CREATE POLICY "Org members can read"
    ON public.intakter FOR SELECT TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can insert"
    ON public.intakter FOR INSERT TO authenticated
    WITH CHECK (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can update"
    ON public.intakter FOR UPDATE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can delete"
    ON public.intakter FOR DELETE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Org-medvetna policyer för utgifter
CREATE POLICY "Org members can read"
    ON public.utgifter FOR SELECT TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can insert"
    ON public.utgifter FOR INSERT TO authenticated
    WITH CHECK (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can update"
    ON public.utgifter FOR UPDATE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org members can delete"
    ON public.utgifter FOR DELETE TO authenticated
    USING (
        organisation_id = get_current_org_id()
        OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );

-- RLS-policyer för organisations
CREATE POLICY "Superadmins can manage organisations"
    ON public.organisations FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Members can view own organisation"
    ON public.organisations FOR SELECT TO authenticated
    USING (
        id IN (SELECT organisation_id FROM public.organisation_members WHERE user_id = auth.uid())
    );

-- RLS-policyer för organisation_members
CREATE POLICY "Superadmins can manage members"
    ON public.organisation_members FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'superadmin')
    );
CREATE POLICY "Org admins can manage own org members"
    ON public.organisation_members FOR ALL TO authenticated
    USING (
        organisation_id = get_current_org_id()
        AND EXISTS (
            SELECT 1 FROM public.organisation_members om
            WHERE om.user_id = auth.uid()
            AND om.organisation_id = organisation_id
            AND om.role IN ('admin', 'superadmin')
        )
    );
CREATE POLICY "Users can view own memberships"
    ON public.organisation_members FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- -----------------------------------------------
-- 12. Auto-migrering av befintliga admins
-- -----------------------------------------------
INSERT INTO public.organisation_members (organisation_id, user_id, role, permissions)
SELECT
    '00000000-0000-0000-0000-000000000001'::UUID,
    up.id,
    up.role,
    up.permissions
FROM public.user_profiles up
WHERE up.role IN ('admin', 'superadmin')
ON CONFLICT (organisation_id, user_id) DO NOTHING;

-- Also add regular users with permissions to the default org
INSERT INTO public.organisation_members (organisation_id, user_id, role, permissions)
SELECT
    '00000000-0000-0000-0000-000000000001'::UUID,
    up.id,
    up.role,
    up.permissions
FROM public.user_profiles up
WHERE up.role = 'user'
ON CONFLICT (organisation_id, user_id) DO NOTHING;

-- -----------------------------------------------
-- 13. Update RPC functions to be org-aware
-- -----------------------------------------------
DROP FUNCTION IF EXISTS add_family_with_children(JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.add_family_with_children(
    family_data JSONB,
    children_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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

DROP FUNCTION IF EXISTS update_family_with_children(UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.update_family_with_children(
    p_family_id UUID,
    family_data JSONB,
    children_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
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

-- =============================================================
-- KLART — Multi-tenant migration klar.
-- =============================================================
