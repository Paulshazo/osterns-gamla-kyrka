-- Manual family payment status (unpaid / paid-until) that overrides latest payment.
-- Also allow families without parents (sibling households).

ALTER TABLE public.familjer
    ADD COLUMN IF NOT EXISTS manuell_obetald BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.familjer
    ADD COLUMN IF NOT EXISTS manuell_betalat_till DATE;

ALTER TABLE public.familjer
    ALTER COLUMN make_namn DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.set_family_payment_status(
    p_family_id UUID,
    p_manuell_obetald BOOLEAN,
    p_manuell_betalat_till DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT organisation_id INTO v_org_id
    FROM public.familjer
    WHERE id = p_family_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Familjen hittades inte';
    END IF;

    IF v_org_id IS NULL OR NOT public.can_edit_section(v_org_id, 'payments') THEN
        RAISE EXCEPTION 'Inte behörig att redigera betalningar';
    END IF;

    UPDATE public.familjer
    SET
        manuell_obetald = COALESCE(p_manuell_obetald, false),
        manuell_betalat_till = p_manuell_betalat_till
    WHERE id = p_family_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_family_payment_status(UUID, BOOLEAN, DATE) TO authenticated;
