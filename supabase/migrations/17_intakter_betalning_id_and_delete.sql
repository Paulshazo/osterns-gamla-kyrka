-- Live DB saknar intakter.betalning_id (migration 08 kördes aldrig).
-- Utan kolumnen kraschar delete_income_entry vid radering av medlemsavgift.

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

-- Koppla befintliga medlemsavgifter till senaste matchande betalningen
UPDATE public.intakter i
SET betalning_id = matched.payment_id
FROM (
    SELECT DISTINCT ON (i2.id)
        i2.id AS income_id,
        p.id AS payment_id
    FROM public.intakter i2
    JOIN public.familjer f
      ON f.organisation_id = i2.organisation_id
     AND i2.rapporterat_av = 'Medlemsavgift — ' || f.familje_namn
    JOIN public.betalningar p
      ON p.familj_id = f.id
     AND p.organisation_id = i2.organisation_id
     AND COALESCE(p.summan, 0) = COALESCE(i2.medlems_avgift, i2.total, 0)
    WHERE i2.betalning_id IS NULL
      AND i2.rapporterat_av LIKE 'Medlemsavgift — %'
    ORDER BY i2.id, p.betalat_till_datum DESC NULLS LAST, p.created_at DESC
) matched
WHERE i.id = matched.income_id
  AND i.betalning_id IS NULL;

CREATE OR REPLACE FUNCTION public.delete_income_entry(p_income_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
    v_payment UUID;
    v_reported TEXT;
    v_amount NUMERIC;
    v_family UUID;
BEGIN
    SELECT organisation_id, betalning_id, rapporterat_av,
           COALESCE(medlems_avgift, total, 0)
    INTO v_org, v_payment, v_reported, v_amount
    FROM public.intakter
    WHERE id = p_income_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intäkten hittades inte';
    END IF;

    IF v_org IS NULL
        OR (
            NOT public.can_edit_section(v_org, 'income')
            AND NOT public.can_edit_section(v_org, 'payments')
        )
    THEN
        RAISE EXCEPTION 'Inte behörig att radera intäkter';
    END IF;

    IF v_payment IS NULL
        AND v_reported IS NOT NULL
        AND v_reported LIKE 'Medlemsavgift — %'
    THEN
        SELECT f.id INTO v_family
        FROM public.familjer f
        WHERE f.organisation_id = v_org
          AND f.familje_namn = substring(v_reported from length('Medlemsavgift — ') + 1)
        LIMIT 1;

        IF v_family IS NOT NULL THEN
            SELECT p.id INTO v_payment
            FROM public.betalningar p
            WHERE p.familj_id = v_family
              AND (v_amount <= 0 OR COALESCE(p.summan, 0) = v_amount)
            ORDER BY p.betalat_till_datum DESC NULLS LAST, p.created_at DESC
            LIMIT 1;
        END IF;
    END IF;

    IF v_payment IS NOT NULL THEN
        DELETE FROM public.betalningar WHERE id = v_payment;
    END IF;

    DELETE FROM public.intakter WHERE id = p_income_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_income_entry(UUID) TO authenticated;
