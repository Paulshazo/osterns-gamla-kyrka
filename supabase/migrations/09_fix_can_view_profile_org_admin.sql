-- =============================================================
-- Fix: org-admins could manage users but not SEE their profiles.
-- can_view_profile previously required organisation_members.role
-- IN ('admin','superadmin'), while is_org_admin also treats
-- user_profiles.role = 'admin' as admin. Align the two.
-- =============================================================

CREATE OR REPLACE FUNCTION public.can_view_profile(p_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() = p_user_id
    OR public.is_superadmin()
    OR EXISTS (
        SELECT 1
        FROM public.organisation_members mine
        JOIN public.organisation_members theirs
          ON theirs.organisation_id = mine.organisation_id
        WHERE mine.user_id = auth.uid()
          AND COALESCE(mine.is_active, true) = true
          AND theirs.user_id = p_user_id
          AND public.is_org_admin(mine.organisation_id)
    );
$$;
