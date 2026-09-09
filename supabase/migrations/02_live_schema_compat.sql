-- =============================================================
-- PATCH: Kolumner som den live appen redan använder
-- Kör i SQL Editor efter 00_full_schema.sql
-- Idempotent.
-- =============================================================

ALTER TABLE public.familjer
    ADD COLUMN IF NOT EXISTS civilstand TEXT;

ALTER TABLE public.betalningar
    ALTER COLUMN belopp DROP NOT NULL;

ALTER TABLE public.betalningar
    ADD COLUMN IF NOT EXISTS total_manads_avgift INTEGER,
    ADD COLUMN IF NOT EXISTS total_ars_avgift INTEGER,
    ADD COLUMN IF NOT EXISTS summan INTEGER,
    ADD COLUMN IF NOT EXISTS betalat_till_datum DATE,
    ADD COLUMN IF NOT EXISTS betalat_via TEXT,
    ADD COLUMN IF NOT EXISTS betalnings_referens TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.utgifter
    ADD COLUMN IF NOT EXISTS vecka INTEGER,
    ADD COLUMN IF NOT EXISTS hyra INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS frukost INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rakning INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS annat INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_itemized BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS kommentar TEXT;
