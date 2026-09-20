-- Inloggning: Österns Gamla Kyrka (emblem + text)
UPDATE public.app_settings
SET
    login_logo_url = '/orgs/osterns-gamla-kyrka-login.png',
    login_logo_size = 140,
    login_title = NULL,
    login_subtitle = 'Logga in på medlemsregistret'
WHERE login_logo_url IS DISTINCT FROM '/orgs/osterns-gamla-kyrka-login.png'
   OR login_logo_size IS DISTINCT FROM 140;
