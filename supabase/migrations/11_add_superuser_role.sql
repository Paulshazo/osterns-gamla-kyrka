-- =============================================================
-- STEP 1 of 2 — Run this FIRST, alone, then Run STEP 2.
-- Adds enum value "superuser". Must be committed before use.
-- =============================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'superuser';
