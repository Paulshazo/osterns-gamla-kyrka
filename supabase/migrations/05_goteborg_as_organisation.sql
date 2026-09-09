-- Göteborg som organisation + stöd för fler organisationer.
-- Kör gärna 04_fix_org_rls_recursion.sql först om du inte redan gjort det.

-- Byt namn på den organisation som har medlemsdata (Göteborgs register)
UPDATE public.organisations
SET name = 'Göteborg',
    slug = 'goteborg'
WHERE id = (
    SELECT organisation_id
    FROM public.familjer
    WHERE organisation_id IS NOT NULL
    GROUP BY organisation_id
    ORDER BY COUNT(*) DESC
    LIMIT 1
);

UPDATE public.app_settings
SET admin_title = 'Göteborg',
    login_title = 'Välkommen',
    login_subtitle = 'Logga in på Göteborg'
WHERE organisation_id = (
    SELECT id FROM public.organisations WHERE slug = 'goteborg' LIMIT 1
)
OR (id = 1 AND organisation_id IS NOT NULL);

-- Tillåt flera app_settings-rader (en per organisation)
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.app_settings'::regclass AND contype = 'c'
    LOOP
        EXECUTE format('ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.app_settings_id_seq;
SELECT setval(
    'public.app_settings_id_seq',
    GREATEST(COALESCE((SELECT MAX(id) FROM public.app_settings), 1), 1)
);
ALTER TABLE public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq');
ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_org_unique'
    ) THEN
        ALTER TABLE public.app_settings
            ADD CONSTRAINT app_settings_org_unique UNIQUE (organisation_id);
    END IF;
END $$;

DROP POLICY IF EXISTS "Superadmins can delete settings" ON public.app_settings;
CREATE POLICY "Superadmins can delete settings"
    ON public.app_settings FOR DELETE TO authenticated
    USING (public.is_superadmin());
