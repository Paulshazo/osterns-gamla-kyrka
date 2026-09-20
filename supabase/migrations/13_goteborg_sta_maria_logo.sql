-- Sätt S:ta Maria Församling-logotypen på Göteborg-organisationen.
-- Statiska filer ligger i public/orgs/ (serveras som /orgs/...).

UPDATE public.organisations
SET logo_url = '/orgs/goteborg-mark.png'
WHERE slug = 'goteborg';

UPDATE public.app_settings
SET
    admin_title = 'Göteborg',
    admin_logo_url = '/orgs/goteborg-logo.png',
    admin_logo_size = 40,
    login_logo_url = '/orgs/goteborg-logo-login.png',
    login_logo_size = 112,
    login_title = 'S:ta Maria Församling',
    login_subtitle = 'Logga in på Göteborg'
WHERE organisation_id = (
    SELECT id FROM public.organisations WHERE slug = 'goteborg' LIMIT 1
);
