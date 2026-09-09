"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import {
    Users, Search, Plus, Edit2, Trash2, ChevronRight,
    RefreshCcw, X, FileSpreadsheet, FileText, Download
} from "lucide-react"
import { FamilyForm } from "@/components/family-form"
import { useLanguage } from "@/components/language-provider"
import { exportToExcel, exportToPDF } from "@/lib/export"
import { logAuditAction } from "@/app/actions/audit"
import { useActiveOrg } from "@/hooks/useActiveOrg"

interface Family {
    id: string
    familje_namn: string
    make_namn: string
    hustru_namn: string | null
    mobil_nummer: string | null
    mail: string | null
    adress: string | null
    ort: string | null
    post_kod: string | null
    land: string | null
    make_personnummer: string | null
    make_manads_avgift: number
    hustru_personnummer: string | null
    hustru_manads_avgift: number
    created_at: string
}

interface FullFamily extends Family { children: any[] }

export default function RegisterPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const { activeOrgId } = useActiveOrg()

    const [families, setFamilies] = useState<Family[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [showForm, setShowForm] = useState(false)
    const [selectedFamily, setSelectedFamily] = useState<FullFamily | null>(null)
    const [viewMode, setViewMode] = useState(false)
    const [deleteMode, setDeleteMode] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)
    const [exporting, setExporting] = useState(false)

    const fetchFamilies = async () => {
        if (!supabase || !activeOrgId) return
        setLoading(true)
        const { data } = await supabase
            .from('familjer')
            .select('*')
            .eq('organisation_id', activeOrgId)
            .order('familje_namn', { ascending: true })
        setFamilies(data ?? [])
        setLoading(false)
    }

    const fetchFamilyDetails = async (id: string): Promise<FullFamily | null> => {
        if (!supabase) return null
        setActionLoading(true)
        try {
            const [{ data: fam }, { data: children }] = await Promise.all([
                supabase.from('familjer').select('*').eq('id', id).single(),
                supabase.from('barn').select('*').eq('familj_id', id).order('ordning'),
            ])
            return fam ? { ...fam, children: children ?? [] } : null
        } finally {
            setActionLoading(false)
        }
    }

    const handleEdit = async (id: string) => {
        const d = await fetchFamilyDetails(id)
        if (d) { setSelectedFamily(d); setEditMode(true) }
    }

    const handleView = async (id: string) => {
        const d = await fetchFamilyDetails(id)
        if (d) { setSelectedFamily(d); setViewMode(true) }
    }

    const handleDeleteClick = (f: Family) => {
        setSelectedFamily({ ...f, children: [] })
        setDeleteMode(true)
    }

    const confirmDelete = async () => {
        if (!selectedFamily || !supabase) return
        setActionLoading(true)
        const { error } = await supabase.from('familjer').delete().eq('id', selectedFamily.id)
        if (!error) {
            logAuditAction('delete', 'family', String(selectedFamily.id), { familje_namn: selectedFamily.familje_namn })
        }
        setActionLoading(false)
        setDeleteMode(false)
        setSelectedFamily(null)
        fetchFamilies()
    }

    useEffect(() => { fetchFamilies() }, [supabase, activeOrgId])

    const filteredFamilies = families.filter(f =>
        f.familje_namn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.make_namn?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (f.hustru_namn?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
        (f.ort?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
    )

    const handleExcelExport = async () => {
        setExporting(true)
        try {
            const headers = [
                language === 'sv' ? 'Familjenamn' : 'Family Name',
                language === 'sv' ? 'Make' : 'Husband',
                language === 'sv' ? 'Hustru' : 'Wife',
                language === 'sv' ? 'Mobil' : 'Mobile',
                'E-post',
                language === 'sv' ? 'Adress' : 'Address',
                language === 'sv' ? 'Ort' : 'City',
                language === 'sv' ? 'Postnummer' : 'Zip',
                language === 'sv' ? 'Land' : 'Country',
                language === 'sv' ? 'Månadsavgift Make' : 'Monthly Fee Husband',
                language === 'sv' ? 'Månadsavgift Hustru' : 'Monthly Fee Wife',
            ]
            const rows = families.map(f => [
                f.familje_namn, f.make_namn, f.hustru_namn ?? '',
                f.mobil_nummer ?? '', f.mail ?? '',
                f.adress ?? '', f.ort ?? '', f.post_kod ?? '', f.land ?? 'Sverige',
                f.make_manads_avgift, f.hustru_manads_avgift,
            ])
            await exportToExcel('Familjeregister', language === 'sv' ? 'Familjer' : 'Families', headers, rows)
        } finally { setExporting(false) }
    }

    const handlePDFExport = async () => {
        setExporting(true)
        try {
            const headers = [
                language === 'sv' ? 'Familjenamn' : 'Family Name',
                language === 'sv' ? 'Make' : 'Husband',
                language === 'sv' ? 'Hustru' : 'Wife',
                language === 'sv' ? 'Mobil' : 'Mobile',
                'E-post',
                language === 'sv' ? 'Ort' : 'City',
            ]
            const rows = families.map(f => [
                f.familje_namn, f.make_namn, f.hustru_namn ?? '—',
                f.mobil_nummer ?? '—', f.mail ?? '—', f.ort ?? '—',
            ])
            await exportToPDF(
                'Familjeregister',
                language === 'sv' ? 'Familjeregister' : 'Family Registry',
                headers, rows
            )
        } finally { setExporting(false) }
    }

    return (
        <div>
            {/* Header */}
            <div className="page-header flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('page.register.title')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('page.register.desc')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={handleExcelExport}
                        disabled={exporting || loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50"
                        title={t('common.export_excel')}
                    >
                        <FileSpreadsheet size={15} style={{ color: '#2C7A4B' }} />
                        Excel
                    </button>
                    <button
                        onClick={handlePDFExport}
                        disabled={exporting || loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50"
                        title={t('common.export_pdf')}
                    >
                        <FileText size={15} style={{ color: '#C0392B' }} />
                        PDF
                    </button>
                    <button
                        onClick={fetchFamilies}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors"
                        aria-label="Uppdatera"
                    >
                        <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-primary-foreground"
                        style={{ background: '#1A1A1A' }}
                    >
                        <Plus size={15} />
                        {t('page.register.add')}
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-5">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="text"
                    placeholder={t('page.register.search')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-premium pl-9"
                />
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto table-scroll-wrapper">
                    <table className="premium-table">
                        <thead>
                            <tr>
                                <th>{t('table.family_name')}</th>
                                <th>{t('table.parents')}</th>
                                <th>{t('table.mobile')}</th>
                                <th>{t('table.city')}</th>
                                <th className="text-right">{t('table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 5 }).map((_, j) => (
                                            <td key={j}>
                                                <div className="h-4 bg-secondary rounded animate-pulse" style={{ width: j === 4 ? 64 : '80%' }} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : filteredFamilies.length > 0 ? (
                                filteredFamilies.map(f => (
                                    <tr key={f.id}>
                                        <td className="font-semibold">{f.familje_namn}</td>
                                        <td>
                                            <div>{f.make_namn}</div>
                                            {f.hustru_namn && (
                                                <div className="text-xs text-muted-foreground">{f.hustru_namn}</div>
                                            )}
                                        </td>
                                        <td className="text-muted-foreground">{f.mobil_nummer ?? '—'}</td>
                                        <td>{f.ort ?? '—'}</td>
                                        <td>
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => handleEdit(f.id)}
                                                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                                                    aria-label={t('common.edit')}
                                                >
                                                    <Edit2 size={14} style={{ color: '#C9A84C' }} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(f)}
                                                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                                                    aria-label={t('common.delete')}
                                                >
                                                    <Trash2 size={14} style={{ color: '#C0392B' }} />
                                                </button>
                                                <button
                                                    onClick={() => handleView(f.id)}
                                                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                                                    aria-label={t('common.view')}
                                                >
                                                    <ChevronRight size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-16 text-muted-foreground">
                                        <Users size={40} className="mx-auto mb-3 opacity-20" />
                                        {searchQuery ? t('table.empty_search') : t('table.empty_register')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {!loading && filteredFamilies.length > 0 && (
                    <div className="px-4 py-3 border-t border-border bg-secondary/30">
                        <p className="text-xs text-muted-foreground">
                            {language === 'sv'
                                ? `${filteredFamilies.length} av ${families.length} familjer`
                                : `${filteredFamilies.length} of ${families.length} families`}
                        </p>
                    </div>
                )}
            </div>

            {/* Add form */}
            {showForm && (
                <FamilyForm
                    onClose={() => setShowForm(false)}
                    onSuccess={() => { setShowForm(false); fetchFamilies() }}
                />
            )}

            {/* Edit form */}
            {editMode && selectedFamily && (
                <FamilyForm
                    initialData={selectedFamily}
                    onClose={() => { setEditMode(false); setSelectedFamily(null) }}
                    onSuccess={() => { setEditMode(false); setSelectedFamily(null); fetchFamilies() }}
                />
            )}

            {/* Delete dialog */}
            {deleteMode && selectedFamily && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-md p-8">
                        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={22} style={{ color: '#C0392B' }} />
                        </div>
                        <h2 className="text-lg font-bold text-center mb-2">
                            {language === 'sv' ? 'Bekräfta radering' : 'Confirm deletion'}
                        </h2>
                        <p className="text-sm text-muted-foreground text-center mb-6">
                            {language === 'sv'
                                ? `Är du säker att du vill radera familjen `
                                : `Are you sure you want to delete family `}
                            <strong>{selectedFamily.familje_namn}</strong>?
                            {language === 'sv'
                                ? ' Alla barn och betalningar raderas permanent.'
                                : ' All children and payments will be permanently deleted.'}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteMode(false)}
                                disabled={actionLoading}
                                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={actionLoading}
                                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white transition-colors disabled:opacity-60"
                                style={{ background: '#C0392B' }}
                            >
                                {actionLoading
                                    ? (language === 'sv' ? 'Raderar...' : 'Deleting...')
                                    : (language === 'sv' ? 'Ja, radera' : 'Yes, delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View modal */}
            {viewMode && selectedFamily && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="text-lg font-bold">
                                {language === 'sv' ? 'Familjedetaljer' : 'Family Details'}: {selectedFamily.familje_namn}
                            </h2>
                            <button
                                onClick={() => setViewMode(false)}
                                className="p-2 rounded-[10px] hover:bg-secondary transition-colors"
                                aria-label={t('common.close')}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Contact */}
                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                                    {language === 'sv' ? 'Kontaktuppgifter' : 'Contact'}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    {[
                                        [language === 'sv' ? 'Mobil' : 'Mobile', selectedFamily.mobil_nummer],
                                        ['E-post', selectedFamily.mail],
                                        [language === 'sv' ? 'Adress' : 'Address', selectedFamily.adress],
                                        [language === 'sv' ? 'Ort' : 'City', `${selectedFamily.ort ?? ''} ${selectedFamily.post_kod ?? ''}`.trim()],
                                        [language === 'sv' ? 'Land' : 'Country', selectedFamily.land ?? 'Sverige'],
                                    ].map(([label, value]) => (
                                        <div key={label} className="bg-secondary rounded-[10px] p-3">
                                            <div className="text-xs text-muted-foreground mb-1">{label}</div>
                                            <div className="font-medium">{value || '—'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Adults */}
                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                                    {language === 'sv' ? 'Föräldrar' : 'Parents'}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {selectedFamily.make_namn && (
                                        <div className="bg-secondary rounded-[10px] p-4">
                                            <div className="font-semibold mb-1">{selectedFamily.make_namn}</div>
                                            <div className="text-xs text-muted-foreground">PN: {selectedFamily.make_personnummer ?? '—'}</div>
                                            <div className="text-xs text-muted-foreground">{selectedFamily.make_manads_avgift} kr/mån</div>
                                        </div>
                                    )}
                                    {selectedFamily.hustru_namn && (
                                        <div className="bg-secondary rounded-[10px] p-4">
                                            <div className="font-semibold mb-1">{selectedFamily.hustru_namn}</div>
                                            <div className="text-xs text-muted-foreground">PN: {selectedFamily.hustru_personnummer ?? '—'}</div>
                                            <div className="text-xs text-muted-foreground">{selectedFamily.hustru_manads_avgift} kr/mån</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Children */}
                            {selectedFamily.children?.length > 0 && (
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                                        {language === 'sv' ? `Barn (${selectedFamily.children.length})` : `Children (${selectedFamily.children.length})`}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {selectedFamily.children.map((child: any, i: number) => (
                                            <div key={child.id ?? i} className="bg-secondary rounded-[10px] p-3 text-sm">
                                                <div className="font-medium">{child.namn}</div>
                                                <div className="text-xs text-muted-foreground">{child.manads_avgift} kr/mån</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="px-6 pb-6">
                            <button
                                onClick={() => setViewMode(false)}
                                className="w-full py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors"
                            >
                                {t('common.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
