"use server"

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logAuditAction } from './audit'
import { getActiveOrgId } from './org'
import { supabaseAnonKey, supabaseUrl } from '@/utils/supabase/config'
import { isPlatformRole, isSuperAdminRole } from '@/lib/permissions'
import {
    ORG_DOCUMENTS_BUCKET,
    ORG_DOCUMENTS_MAX_BYTES,
    sanitizeOrganisationFileName,
} from '@/lib/org-documents'

const BUCKET = ORG_DOCUMENTS_BUCKET
const MAX_BYTES = ORG_DOCUMENTS_MAX_BYTES

async function getAuthClient() {
    const cookieStore = await cookies()
    return createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() { return cookieStore.getAll() },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    )
                } catch { }
            },
        },
    })
}

async function getProfileRole(supabase: Awaited<ReturnType<typeof getAuthClient>>, userId: string) {
    const { data } = await supabase.from('user_profiles').select('role').eq('id', userId).single()
    return data?.role ?? null
}

async function assertOrgMember(orgId: string) {
    const supabase = await getAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Ej inloggad')

    const role = await getProfileRole(supabase, user.id)
    if (isPlatformRole(role)) return { supabase, user }

    const { data: membership } = await supabase
        .from('organisation_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .maybeSingle()

    if (!membership) throw new Error('Inte behörig till denna organisation')
    return { supabase, user }
}

async function assertOrgAdmin(orgId: string) {
    const { supabase, user } = await assertOrgMember(orgId)
    const role = await getProfileRole(supabase, user.id)
    if (isSuperAdminRole(role)) return { supabase, user }

    const { data: membership } = await supabase
        .from('organisation_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .maybeSingle()

    if (membership?.role === 'admin') return { supabase, user }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role === 'admin') return { supabase, user }

    throw new Error('Endast administratörer kan hantera dokument')
}

export async function listOrganisationDocuments(orgId?: string) {
    try {
        const resolvedOrgId = orgId ?? await getActiveOrgId()
        if (!resolvedOrgId) throw new Error('Ingen organisation vald')

        const { supabase } = await assertOrgMember(resolvedOrgId)
        const { data, error } = await supabase
            .from('organisation_documents')
            .select('id, organisation_id, file_name, storage_path, mime_type, size_bytes, uploaded_by, created_at')
            .eq('organisation_id', resolvedOrgId)
            .order('created_at', { ascending: false })

        if (error) throw error
        return { success: true as const, documents: data ?? [] }
    } catch (error: any) {
        return { success: false as const, documents: [], error: error.message }
    }
}

export async function registerOrganisationDocument(input: {
    organisationId?: string
    fileName: string
    storagePath: string
    mimeType: string
    sizeBytes: number
}) {
    try {
        const orgId = input.organisationId ?? await getActiveOrgId()
        if (!orgId) throw new Error('Ingen organisation vald')
        if (!input.storagePath.startsWith(`${orgId}/`)) {
            throw new Error('Ogiltig lagringssökväg')
        }
        if (input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) {
            throw new Error('Filen måste vara mellan 1 byte och 20 MB')
        }

        const { supabase, user } = await assertOrgAdmin(orgId)
        const { data, error } = await supabase
            .from('organisation_documents')
            .insert({
                organisation_id: orgId,
                file_name: sanitizeOrganisationFileName(input.fileName),
                storage_path: input.storagePath,
                mime_type: input.mimeType || null,
                size_bytes: input.sizeBytes,
                uploaded_by: user.id,
            })
            .select('id')
            .single()

        if (error) throw error

        await logAuditAction('create', 'document', data.id, {
            file_name: input.fileName,
            organisation_id: orgId,
        })

        return { success: true as const, id: data.id }
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}

export async function deleteOrganisationDocument(documentId: string, orgId?: string) {
    try {
        const resolvedOrgId = orgId ?? await getActiveOrgId()
        if (!resolvedOrgId) throw new Error('Ingen organisation vald')

        const { supabase } = await assertOrgAdmin(resolvedOrgId)

        const { data: doc, error: fetchError } = await supabase
            .from('organisation_documents')
            .select('id, organisation_id, storage_path, file_name')
            .eq('id', documentId)
            .eq('organisation_id', resolvedOrgId)
            .single()

        if (fetchError || !doc) throw new Error('Dokumentet hittades inte')

        const { error: storageError } = await supabase.storage
            .from(BUCKET)
            .remove([doc.storage_path])
        if (storageError) throw storageError

        const { error: deleteError } = await supabase
            .from('organisation_documents')
            .delete()
            .eq('id', documentId)

        if (deleteError) throw deleteError

        await logAuditAction('delete', 'document', documentId, {
            file_name: doc.file_name,
            organisation_id: resolvedOrgId,
        })

        return { success: true as const }
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}

async function getSignedDocumentAccess(
    documentId: string,
    orgId: string | undefined,
    expiresInSeconds: number,
    access: 'view' | 'download',
) {
    const resolvedOrgId = orgId ?? await getActiveOrgId()
    if (!resolvedOrgId) throw new Error('Ingen organisation vald')

    if (access === 'download') {
        await assertOrgAdmin(resolvedOrgId)
    } else {
        await assertOrgMember(resolvedOrgId)
    }

    const supabase = await getAuthClient()
    const { data: doc, error: fetchError } = await supabase
        .from('organisation_documents')
        .select('id, storage_path, file_name, organisation_id, mime_type')
        .eq('id', documentId)
        .eq('organisation_id', resolvedOrgId)
        .single()

    if (fetchError || !doc) throw new Error('Dokumentet hittades inte')

    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.storage_path, expiresInSeconds)

    if (error || !data?.signedUrl) throw error ?? new Error('Kunde inte öppna dokumentet')

    return {
        url: data.signedUrl,
        fileName: doc.file_name,
        mimeType: doc.mime_type as string | null,
    }
}

/** Signed URL for in-app preview (all org members). */
export async function getDocumentViewUrl(documentId: string, orgId?: string) {
    try {
        const data = await getSignedDocumentAccess(documentId, orgId, 600, 'view')
        return { success: true as const, ...data }
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}

/** Signed URL for file download (org admins / superadmin only). */
export async function getDocumentDownloadUrl(documentId: string, orgId?: string) {
    try {
        const data = await getSignedDocumentAccess(documentId, orgId, 120, 'download')
        return { success: true as const, ...data }
    } catch (error: any) {
        return { success: false as const, error: error.message }
    }
}

