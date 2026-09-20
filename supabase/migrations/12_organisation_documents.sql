-- =============================================================
-- Per-organisation document storage (admin write, members read)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.organisation_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    storage_path    TEXT NOT NULL UNIQUE,
    mime_type       TEXT,
    size_bytes      BIGINT,
    uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organisation_documents_org_idx
    ON public.organisation_documents(organisation_id);

ALTER TABLE public.organisation_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read org documents" ON public.organisation_documents;
CREATE POLICY "Read org documents"
    ON public.organisation_documents FOR SELECT TO authenticated
    USING (
        public.is_platform_staff()
        OR EXISTS (
            SELECT 1 FROM public.organisation_members om
            WHERE om.user_id = auth.uid()
              AND om.organisation_id = organisation_documents.organisation_id
              AND COALESCE(om.is_active, true) = true
        )
    );

DROP POLICY IF EXISTS "Admins manage org documents" ON public.organisation_documents;
CREATE POLICY "Admins manage org documents"
    ON public.organisation_documents FOR INSERT TO authenticated
    WITH CHECK (public.is_org_admin(organisation_id));

CREATE POLICY "Admins update org documents"
    ON public.organisation_documents FOR UPDATE TO authenticated
    USING (public.is_org_admin(organisation_id))
    WITH CHECK (public.is_org_admin(organisation_id));

CREATE POLICY "Admins delete org documents"
    ON public.organisation_documents FOR DELETE TO authenticated
    USING (public.is_org_admin(organisation_id));

-- Private bucket for org files (path: {organisation_id}/{document_id}/{filename})
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('org_documents', 'org_documents', false, 20971520)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520;

CREATE OR REPLACE FUNCTION public.storage_org_id_from_path(object_path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(split_part(object_path, '/', 1), '')::uuid;
$$;

DROP POLICY IF EXISTS "Org members read document files" ON storage.objects;
CREATE POLICY "Org members read document files"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'org_documents'
        AND (
            public.is_platform_staff()
            OR EXISTS (
                SELECT 1 FROM public.organisation_members om
                WHERE om.user_id = auth.uid()
                  AND om.organisation_id = public.storage_org_id_from_path(name)
                  AND COALESCE(om.is_active, true) = true
            )
        )
    );

DROP POLICY IF EXISTS "Org admins upload document files" ON storage.objects;
CREATE POLICY "Org admins upload document files"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'org_documents'
        AND public.is_org_admin(public.storage_org_id_from_path(name))
    );

DROP POLICY IF EXISTS "Org admins update document files" ON storage.objects;
CREATE POLICY "Org admins update document files"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'org_documents'
        AND public.is_org_admin(public.storage_org_id_from_path(name))
    );

DROP POLICY IF EXISTS "Org admins delete document files" ON storage.objects;
CREATE POLICY "Org admins delete document files"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'org_documents'
        AND public.is_org_admin(public.storage_org_id_from_path(name))
    );
