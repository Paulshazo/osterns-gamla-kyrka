"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { useLanguage } from "@/components/language-provider"
import {
    listOrganisationDocuments,
    registerOrganisationDocument,
    deleteOrganisationDocument,
    getDocumentDownloadUrl,
} from "@/app/actions/documents"
import {
    ORG_DOCUMENTS_BUCKET,
    ORG_DOCUMENTS_MAX_BYTES,
    buildOrganisationDocumentPath,
    formatDocumentSize,
} from "@/lib/org-documents"
import { format } from "date-fns"
import { sv, enUS } from "date-fns/locale"
import {
    FileText,
    Upload,
    Download,
    Trash2,
    Loader2,
    AlertCircle,
} from "lucide-react"

export type OrganisationDocumentRow = {
    id: string
    organisation_id: string
    file_name: string
    storage_path: string
    mime_type: string | null
    size_bytes: number | null
    uploaded_by: string | null
    created_at: string
}

type Props = {
    organisationId: string
    canManage: boolean
    /** Hide outer card chrome when embedded in Super Admin tabs */
    embedded?: boolean
}

export function OrganisationDocumentsPanel({ organisationId, canManage, embedded }: Props) {
    const { t, language } = useLanguage()
    const locale = language === 'sv' ? sv : enUS
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [documents, setDocuments] = useState<OrganisationDocumentRow[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const showMsg = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text })
        if (type === 'success') setTimeout(() => setMessage(null), 3500)
    }

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await listOrganisationDocuments(organisationId)
            if (!res.success) throw new Error(res.error)
            setDocuments(res.documents as OrganisationDocumentRow[])
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('page.documents.error_load')
            showMsg('error', msg)
        } finally {
            setLoading(false)
        }
    }, [organisationId, t])

    useEffect(() => {
        if (organisationId) refresh()
    }, [organisationId, refresh])

    const handleUpload = async (file: File) => {
        if (!canManage || !supabase) return
        if (file.size <= 0 || file.size > ORG_DOCUMENTS_MAX_BYTES) {
            showMsg('error', t('page.documents.error_size'))
            return
        }

        setUploading(true)
        setMessage(null)
        const documentId = crypto.randomUUID()
        const storagePath = buildOrganisationDocumentPath(organisationId, documentId, file.name)

        try {
            const { error: uploadError } = await supabase.storage
                .from(ORG_DOCUMENTS_BUCKET)
                .upload(storagePath, file, {
                    contentType: file.type || undefined,
                    upsert: false,
                })
            if (uploadError) throw uploadError

            const reg = await registerOrganisationDocument({
                organisationId,
                fileName: file.name,
                storagePath,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
            })

            if (!reg.success) {
                await supabase.storage.from(ORG_DOCUMENTS_BUCKET).remove([storagePath])
                throw new Error(reg.error)
            }

            showMsg('success', t('page.documents.upload_success'))
            await refresh()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('page.documents.error_upload')
            showMsg('error', msg)
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleDownload = async (doc: OrganisationDocumentRow) => {
        setBusyId(doc.id)
        try {
            const res = await getDocumentDownloadUrl(doc.id, organisationId)
            if (!res.success || !res.url) throw new Error(res.error)
            window.open(res.url, '_blank', 'noopener,noreferrer')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('page.documents.error_download')
            showMsg('error', msg)
        } finally {
            setBusyId(null)
        }
    }

    const handleDelete = async (doc: OrganisationDocumentRow) => {
        if (!canManage) return
        const confirmText = t('page.documents.confirm_delete').replace('{name}', doc.file_name)
        if (!confirm(confirmText)) return

        setBusyId(doc.id)
        try {
            const res = await deleteOrganisationDocument(doc.id, organisationId)
            if (!res.success) throw new Error(res.error)
            showMsg('success', t('page.documents.delete_success'))
            await refresh()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('page.documents.error_delete')
            showMsg('error', msg)
        } finally {
            setBusyId(null)
        }
    }

    const inner = (
        <div className="space-y-4">
            {message && (
                <div className={`p-3 rounded-[10px] text-sm border font-medium ${
                    message.type === 'success'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                    {message.text}
                </div>
            )}

            {canManage && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) void handleUpload(file)
                        }}
                    />
                    <button
                        type="button"
                        disabled={uploading || !supabase}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-60"
                        style={{ background: '#1A1A1A', color: '#FEFCF8' }}
                    >
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {uploading ? t('page.documents.uploading') : t('page.documents.upload')}
                    </button>
                    <p className="text-xs" style={{ color: '#8A8178' }}>
                        {t('page.documents.max_size')}
                    </p>
                </div>
            )}

            {!canManage && (
                <p className="text-sm flex items-start gap-2" style={{ color: '#6B6355' }}>
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    {t('page.documents.read_only_hint')}
                </p>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin" size={22} style={{ color: '#C9A84C' }} />
                </div>
            ) : documents.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-[12px] border border-dashed" style={{ borderColor: '#E5E0D8' }}>
                    <FileText size={36} className="mx-auto mb-3" style={{ color: '#DDD8CE' }} />
                    <p className="text-sm font-medium" style={{ color: '#6B6355' }}>{t('page.documents.empty')}</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-[12px] border border-border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs font-semibold uppercase tracking-wide" style={{ background: '#F7F3EC', color: '#8A8178' }}>
                                <th className="px-4 py-3">{t('page.documents.col_name')}</th>
                                <th className="px-4 py-3 hidden sm:table-cell">{t('page.documents.col_size')}</th>
                                <th className="px-4 py-3 hidden md:table-cell">{t('page.documents.col_date')}</th>
                                <th className="px-4 py-3 text-right">{t('table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-card">
                            {documents.map((doc) => (
                                <tr key={doc.id}>
                                    <td className="px-4 py-3 font-medium" style={{ color: '#1A1A1A' }}>
                                        <span className="inline-flex items-center gap-2 min-w-0">
                                            <FileText size={15} style={{ color: '#C9A84C', flexShrink: 0 }} />
                                            <span className="truncate">{doc.file_name}</span>
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell" style={{ color: '#6B6355' }}>
                                        {formatDocumentSize(doc.size_bytes, language)}
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap" style={{ color: '#6B6355' }}>
                                        {format(new Date(doc.created_at), 'd MMM yyyy', { locale })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                disabled={busyId === doc.id}
                                                onClick={() => void handleDownload(doc)}
                                                className="p-2 rounded-[8px] hover:bg-black/5 transition-colors disabled:opacity-50"
                                                title={t('page.documents.download')}
                                            >
                                                {busyId === doc.id && !canManage ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <Download size={16} style={{ color: '#2980B9' }} />
                                                )}
                                            </button>
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    disabled={busyId === doc.id}
                                                    onClick={() => void handleDelete(doc)}
                                                    className="p-2 rounded-[8px] hover:bg-red-50 transition-colors disabled:opacity-50"
                                                    title={t('common.delete')}
                                                >
                                                    {busyId === doc.id ? (
                                                        <Loader2 size={16} className="animate-spin text-red-400" />
                                                    ) : (
                                                        <Trash2 size={16} className="text-red-400" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )

    if (embedded) {
        return inner
    }

    return (
        <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center gap-2" style={{ background: '#F7F3EC' }}>
                <FileText size={16} style={{ color: '#C9A84C' }} />
                {t('page.documents.title')}
            </div>
            <div className="p-6">{inner}</div>
        </div>
    )
}
