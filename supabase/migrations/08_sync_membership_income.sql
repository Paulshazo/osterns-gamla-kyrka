-- Koppla medlemsbetalningar till intäkter.
-- En betalning skapar/uppdaterar en intäktsrad. Raderas betalningen försvinner intäkten.
-- Idempotent.

ALTER TABLE public.intakter
    ADD COLUMN IF NOT EXISTS betalning_id UUID REFERENCES public.betalningar(id) ON DELETE CASCADE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'intakter_betalning_id_unique'
    ) THEN
        ALTER TABLE public.intakter
            ADD CONSTRAINT intakter_betalning_id_unique UNIQUE (betalning_id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_membership_income()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_family text;
    v_date date;
    v_month text;
    v_week integer;
    v_months text[] := ARRAY[
        'Januari','Februari','Mars','April','Maj','Juni',
        'Juli','Augusti','September','Oktober','November','December'
    ];
BEGIN
    SELECT familje_namn INTO v_family
    FROM public.familjer
    WHERE id = NEW.familj_id;

    v_date := COALESCE((NEW.created_at AT TIME ZONE 'Europe/Stockholm')::date, CURRENT_DATE);
    v_month := v_months[EXTRACT(MONTH FROM v_date)::integer];
    v_week := EXTRACT(WEEK FROM v_date)::integer;

    INSERT INTO public.intakter (
        organisation_id, datum, manad, vecka,
        medlems_avgift, gavor, ungdomar, annat, total,
        rapporterat_av, betalning_id
    ) VALUES (
        NEW.organisation_id,
        v_date,
        v_month,
        v_week,
        COALESCE(NEW.summan, 0),
        0, 0, 0,
        COALESCE(NEW.summan, 0),
        'Medlemsavgift — ' || COALESCE(v_family, 'Familj'),
        NEW.id
    )
    ON CONFLICT (betalning_id) DO UPDATE SET
        medlems_avgift = EXCLUDED.medlems_avgift,
        total = EXCLUDED.total,
        rapporterat_av = EXCLUDED.rapporterat_av;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_membership_income ON public.betalningar;
CREATE TRIGGER trg_sync_membership_income
    AFTER INSERT OR UPDATE OF summan, familj_id, organisation_id
    ON public.betalningar
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_membership_income();
