-- Större logotyp på inloggningssidan
UPDATE public.app_settings
SET login_logo_size = 176
WHERE login_logo_url = '/orgs/osterns-gamla-kyrka-login.png'
   OR login_logo_size = 140;
