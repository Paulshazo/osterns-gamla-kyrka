-- =============================================================
-- Family registration date, civilstånd on RPC, payment start date,
-- and deleting membership income reverts family paid-until status
-- =============================================================

ALTER TABLE public.familjer
    ADD COLUMN IF NOT EXISTS civilstand TEXT;

ALTER TABLE public.familjer
    ADD COLUMN IF NOT EXISTS registreringsdatum DATE;

UPDATE public.familjer
SET registreringsdatum = DATE '2026-01-01'
WHERE registreringsdatum IS NULL;

ALTER TABLE public.betalningar
    ADD COLUMN IF NOT EXISTS betalat_fran_datum DATE;

-- RPC: persist civilstand + registreringsdatum
CREATE OR REPLACE FUNCTION public.add_family_with_children(
    family_data JSONB,
    children_data JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    IF v_org_id IS NULL OR NOT public.can_edit_section(v_org_id, 'register') THEN
        RAISE EXCEPTION 'Inte behörig att redigera registret';
    END IF;

    INSERT INTO familjer (
        familje_namn, make_namn, make_personnummer, make_manads_avgift,
        hustru_namn, hustru_personnummer, hustru_manads_avgift,
        mobil_nummer, mail, adress, ort, post_kod, land,
        civilstand, registreringsdatum,
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
        NULLIF(family_data->>'civilstand', ''),
        COALESCE((family_data->>'registreringsdatum')::DATE, CURRENT_DATE),
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

CREATE OR REPLACE FUNCTION public.update_family_with_children(
    p_family_id UUID,
    family_data JSONB,
    children_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    IF v_org_id IS NULL OR NOT public.can_edit_section(v_org_id, 'register') THEN
        RAISE EXCEPTION 'Inte behörig att redigera registret';
    END IF;

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
        land                 = COALESCE(family_data->>'land', 'Sverige'),
        civilstand           = NULLIF(family_data->>'civilstand', ''),
        registreringsdatum   = COALESCE((family_data->>'registreringsdatum')::DATE, registreringsdatum)
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

-- Delete income; if it is a membership fee, also delete the payment
-- so family status reverts to the previous betalat_till_datum.
CREATE OR REPLACE FUNCTION public.delete_income_entry(p_income_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID;
    v_payment UUID;
BEGIN
    SELECT organisation_id, betalning_id INTO v_org, v_payment
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

    IF v_payment IS NOT NULL THEN
        DELETE FROM public.betalningar WHERE id = v_payment;
    END IF;

    DELETE FROM public.intakter WHERE id = p_income_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_income_entry(UUID) TO authenticated;
