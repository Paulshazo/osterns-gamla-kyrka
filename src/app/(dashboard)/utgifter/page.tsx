"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { TrendingDown, Plus, RefreshCcw, FileSpreadsheet, FileText, X } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { exportToExcel, exportToPDF } from "@/lib/export"
import { useActiveOrg } from "@/hooks/useActiveOrg"

const months = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"]

export default function UtgifterPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const { activeOrgId } = useActiveOrg()
    const [items, setItems] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedMonth, setSelectedMonth] = useState("Alla")
    const [showForm, setShowForm] = useState(false)
    const [exporting, setExporting] = useState(false)

    const fetchItems = async () => {
        if (!supabase || !activeOrgId) return
        setLoading(true)
        let query = supabase.from('utgifter').select('*').eq('organisation_id', activeOrgId).order('datum', { ascending: false })
        if (selectedMonth !== "Alla") query = query.eq('manad', selectedMonth)
        const { data } = await query
        setItems(data ?? [])
        setLoading(false)
    }

    useEffect(() => { fetchItems() }, [selectedMonth, supabase, activeOrgId])

    const monthlySummary = items.reduce((acc: any, item: any) => {
        const m = item.manad
        if (!acc[m]) acc[m] = { hyra: 0, frukost: 0, rakning: 0, annat: 0, total: 0 }
        acc[m].hyra    += item.hyra    ?? 0
        acc[m].frukost += item.frukost ?? 0
        acc[m].rakning += item.rakning ?? 0
        acc[m].annat   += item.annat   ?? 0
        acc[m].total   += item.total   ?? 0
        return acc
    }, {})

    const grandTotal = items.reduce((s, i) => s + (i.total ?? 0), 0)

    const handleExcelExport = async () => {
        setExporting(true)
        try {
            const headers = [language === 'sv' ? 'Datum' : 'Date', language === 'sv' ? 'Månad' : 'Month', 'Vecka', language === 'sv' ? 'Hyra' : 'Rent', language === 'sv' ? 'Frukost' : 'Breakfast', language === 'sv' ? 'Räkningar' : 'Bills', language === 'sv' ? 'Annat' : 'Other', 'Total kr']
            const rows = items.map(i => [i.datum, i.manad, i.vecka, i.hyra ?? 0, i.frukost ?? 0, i.rakning ?? 0, i.annat ?? 0, i.total ?? 0])
            await exportToExcel('Utgifter', language === 'sv' ? 'Utgifter' : 'Expenses', headers, rows)
        } finally { setExporting(false) }
    }

    const handlePDFExport = async () => {
        setExporting(true)
        try {
            const headers = [language === 'sv' ? 'Datum' : 'Date', language === 'sv' ? 'Månad' : 'Month', 'Vecka', 'Total kr']
            const rows = items.map(i => [i.datum, i.manad, `V.${i.vecka}`, `${i.total ?? 0} kr`])
            await exportToPDF('Utgifter', language === 'sv' ? 'Utgifter' : 'Expenses', headers, rows)
        } finally { setExporting(false) }
    }

    return (
        <div>
            <div className="page-header flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('page.expenses.title')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('page.expenses.desc')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handleExcelExport} disabled={exporting || loading} className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50">
                        <FileSpreadsheet size={15} style={{ color: '#2C7A4B' }} /> Excel
                    </button>
                    <button onClick={handlePDFExport} disabled={exporting || loading} className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50">
                        <FileText size={15} style={{ color: '#C0392B' }} /> PDF
                    </button>
                    <button onClick={fetchItems} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">
                        <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-primary-foreground" style={{ background: '#1A1A1A' }}>
                        <Plus size={15} /> {t('page.expenses.new')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                            <div className="flex items-center gap-2 font-semibold text-sm">
                                <TrendingDown size={16} style={{ color: '#C0392B' }} />
                                {t('page.expenses.weekly')}
                            </div>
                            <select className="input-premium w-auto text-sm py-1.5" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                                <option value="Alla">{t('page.expenses.all_months')}</option>
                                {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="overflow-x-auto table-scroll-wrapper">
                            <table className="premium-table">
                                <thead>
                                    <tr>
                                        <th>{t('page.expenses.date_month')}</th>
                                        <th>V.</th>
                                        <th>{t('table.total')}</th>
                                        <th>{t('page.expenses.rent')}/{t('page.expenses.breakfast')}/{t('page.expenses.bills')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <tr key={i}><td colSpan={4}><div className="h-4 bg-secondary rounded animate-pulse" /></td></tr>
                                        ))
                                    ) : items.length > 0 ? (
                                        items.map(item => (
                                            <tr key={item.id}>
                                                <td>
                                                    <span className="font-medium">{item.datum}</span>
                                                    <span className="text-xs text-muted-foreground ml-2">{item.manad}</span>
                                                </td>
                                                <td className="text-muted-foreground">V.{item.vecka}</td>
                                                <td><span className="font-bold" style={{ color: '#C0392B' }}>-{(item.total ?? 0).toLocaleString('sv-SE')} kr</span></td>
                                                <td className="text-xs text-muted-foreground">
                                                    {item.hyra ?? 0}/{item.frukost ?? 0}/{item.rakning ?? 0}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">{t('page.expenses.empty')}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {items.length > 0 && (
                            <div className="px-5 py-3 border-t border-border bg-secondary/30 flex justify-between items-center">
                                <span className="text-xs text-muted-foreground">{items.length} {language === 'sv' ? 'poster' : 'entries'}</span>
                                <span className="text-sm font-bold" style={{ color: '#C0392B' }}>
                                    {language === 'sv' ? 'Totalt:' : 'Total:'} {grandTotal.toLocaleString('sv-SE')} kr
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary sidebar */}
                <div>
                    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-border font-semibold text-sm flex items-center gap-2">
                            <TrendingDown size={15} style={{ color: '#C0392B' }} />
                            {t('page.expenses.summary')}
                        </div>
                        <div className="divide-y divide-border">
                            {Object.entries(monthlySummary).length > 0 ? (
                                Object.entries(monthlySummary).map(([month, data]: [string, any]) => (
                                    <div key={month} className="p-4 space-y-2">
                                        <div className="font-bold text-sm text-foreground">{month}</div>
                                        {[
                                            [t('page.expenses.rent'), data.hyra],
                                            [t('page.expenses.breakfast'), data.frukost],
                                            [t('page.expenses.bills'), data.rakning],
                                            [t('page.expenses.other'), data.annat],
                                        ].map(([label, val]) => (
                                            <div key={label as string} className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">{label}</span>
                                                <span className="font-medium">{(val as number).toLocaleString('sv-SE')} kr</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between text-sm font-bold pt-2 border-t border-border" style={{ color: '#C0392B' }}>
                                            <span>{t('table.total')}</span>
                                            <span>{data.total.toLocaleString('sv-SE')} kr</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-6 text-center text-muted-foreground text-sm">{t('page.expenses.select_month')}</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {showForm && (
                <ExpenseForm supabase={supabase} t={t} language={language} activeOrgId={activeOrgId} onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); fetchItems() }} />
            )}
        </div>
    )
}

function ExpenseForm({ supabase, t, language, activeOrgId, onClose, onSuccess }: any) {
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState({
        manad: months[new Date().getMonth()],
        vecka: 1, hyra: 0, frukost: 0, rakning: 0, annat: 0,
        rapporterat_av: "", datum: new Date().toISOString().split('T')[0],
    })
    const set = (k: string, v: any) => setData(d => ({ ...d, [k]: v }))

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!supabase) return
        setLoading(true)
        const total = (Number(data.hyra) || 0) + (Number(data.frukost) || 0) + (Number(data.rakning) || 0) + (Number(data.annat) || 0)
        const { error } = await supabase.from('utgifter').insert([{ ...data, total, organisation_id: activeOrgId }])
        setLoading(false)
        if (error) alert(error.message)
        else onSuccess()
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content max-w-lg">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-lg font-bold">{t('page.expenses.new_title')}</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6 grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">{t('page.expenses.month')}</label>
                            <select className="input-premium" value={data.manad} onChange={(e) => set('manad', e.target.value)}>
                                {months.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">{t('page.expenses.week')}</label>
                            <input type="number" className="input-premium" value={data.vecka} onChange={(e) => set('vecka', Number(e.target.value) || 1)} />
                        </div>
                        {[
                            [t('page.expenses.rent'), 'hyra'],
                            [t('page.expenses.breakfast'), 'frukost'],
                            [t('page.expenses.bills'), 'rakning'],
                            [t('page.expenses.other'), 'annat'],
                        ].map(([label, key]) => (
                            <div key={key} className="space-y-1.5">
                                <label className="text-sm font-semibold">{label} (kr)</label>
                                <input type="number" className="input-premium" value={(data as any)[key]} onChange={(e) => set(key, Number(e.target.value) || 0)} />
                            </div>
                        ))}
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-sm font-semibold">{t('page.expenses.reported_by')}</label>
                            <input className="input-premium" value={data.rapporterat_av} onChange={(e) => set('rapporterat_av', e.target.value)} />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-sm font-semibold">{t('page.expenses.date')}</label>
                            <input type="date" className="input-premium" value={data.datum} onChange={(e) => set('datum', e.target.value)} />
                        </div>
                    </div>
                    <div className="flex gap-3 p-6 pt-0">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">{t('common.cancel')}</button>
                        <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-primary-foreground disabled:opacity-60" style={{ background: '#1A1A1A' }}>
                            {loading ? t('common.loading') : t('common.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
