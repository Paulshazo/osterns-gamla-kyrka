-- Kör EFTER 20260401 och 20260402. Raderar ingen medlemsdata.
UPDATE public.organisations
SET name = 'Österns Gamla Kyrka', slug = 'osterns-gamla-kyrka'
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE public.app_settings
SET organisation_id = '00000000-0000-0000-0000-000000000001'
WHERE organisation_id IS NULL;
