"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { BarChart3, TrendingUp, TrendingDown, FileSpreadsheet, FileText } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { exportToExcel, exportToPDF } from "@/lib/export"
import { useActiveOrg } from "@/hooks/useActiveOrg"

const months = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"]

export default function StatistikPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const { activeOrgId } = useActiveOrg()
    const [chartData, setChartData] = useState<{ month: string; income: number; expense: number }[]>([])
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
        if (!supabase || !activeOrgId) return
        const fetchData = async () => {
            setLoading(true)
            const [{ data: income }, { data: expenses }] = await Promise.all([
                supabase.from('intakter').select('manad, total').eq('organisation_id', activeOrgId),
                supabase.from('utgifter').select('manad, total').eq('organisation_id', activeOrgId),
            ])
            const combined = months.map(m => ({
                month: m,
                income:  income?.filter(i => i.manad === m).reduce((s, i) => s + (i.total || 0), 0) || 0,
                expense: expenses?.filter(e => e.manad === m).reduce((s, e) => s + (e.total || 0), 0) || 0,
            }))
            setChartData(combined)
            setLoading(false)
        }
        fetchData()
    }, [supabase, activeOrgId])

    const maxVal = Math.max(...chartData.map(d => Math.max(d.income, d.expense)), 1)
    const totalIncome  = chartData.reduce((s, d) => s + d.income, 0)
    const totalExpense = chartData.reduce((s, d) => s + d.expense, 0)
    const netBalance   = totalIncome - totalExpense

    const handleExcelExport = async () => {
        setExporting(true)
        try {
            const headers = [language === 'sv' ? 'Månad' : 'Month', language === 'sv' ? 'Intäkter' : 'Income', language === 'sv' ? 'Utgifter' : 'Expenses', language === 'sv' ? 'Resultat' : 'Result']
            const rows = chartData.filter(d => d.income > 0 || d.expense > 0).map(d => [d.month, d.income, d.expense, d.income - d.expense])
            await exportToExcel('Statistik', language === 'sv' ? 'Statistik' : 'Statistics', headers, rows)
        } finally { setExporting(false) }
    }

    const handlePDFExport = async () => {
        setExporting(true)
        try {
            const headers = [language === 'sv' ? 'Månad' : 'Month', language === 'sv' ? 'Intäkter' : 'Income', language === 'sv' ? 'Utgifter' : 'Expenses', language === 'sv' ? 'Resultat' : 'Result']
            const rows = chartData.filter(d => d.income > 0 || d.expense > 0).map(d => [d.month, `${d.income.toLocaleString('sv-SE')} kr`, `${d.expense.toLocaleString('sv-SE')} kr`, `${(d.income - d.expense).toLocaleString('sv-SE')} kr`])
            await exportToPDF('Statistik', language === 'sv' ? 'Statistik' : 'Statistics', headers, rows)
        } finally { setExporting(false) }
    }

    return (
        <div>
            <div className="page-header flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('page.stats.title')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('page.stats.desc')}</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExcelExport} disabled={exporting || loading} className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50">
                        <FileSpreadsheet size={15} style={{ color: '#2C7A4B' }} /> Excel
                    </button>
                    <button onClick={handlePDFExport} disabled={exporting || loading} className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50">
                        <FileText size={15} style={{ color: '#C0392B' }} /> PDF
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
                {[
                    { label: language === 'sv' ? 'Total intäkt' : 'Total income', value: totalIncome, color: '#2C7A4B', bg: '#D4EDDA', icon: TrendingUp },
                    { label: language === 'sv' ? 'Total utgift' : 'Total expense', value: totalExpense, color: '#C0392B', bg: '#F8D7DA', icon: TrendingDown },
                    { label: language === 'sv' ? 'Nettoresultat' : 'Net result', value: netBalance, color: netBalance >= 0 ? '#C9A84C' : '#C0392B', bg: netBalance >= 0 ? '#FEF3C7' : '#F8D7DA', icon: BarChart3 },
                ].map(card => {
                    const Icon = card.icon
                    return (
                        <div key={card.label} className="stat-card">
                            <div className="flex items-start justify-between">
                                <div className="stat-label">{card.label}</div>
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
                                    <Icon size={18} style={{ color: card.color }} />
                                </div>
                            </div>
                            <div className="stat-value" style={{ color: card.color }}>
                                {loading ? <div className="h-8 w-32 bg-secondary rounded animate-pulse mt-2" /> : `${card.value.toLocaleString('sv-SE')} kr`}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Bar chart */}
            <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm mb-6">
                <div className="flex items-center gap-2.5 px-6 py-4 border-b border-border font-semibold text-sm" style={{ background: '#F7F3EC' }}>
                    <BarChart3 size={16} style={{ color: '#C9A84C' }} />
                    {t('page.stats.income_vs_expenses')}
                </div>
                <div className="p-6">
                    {loading ? (
                        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                            <div className="animate-pulse">{language === 'sv' ? 'Laddar diagram...' : 'Loading chart...'}</div>
                        </div>
                    ) : (
                        <>
                            <div className="h-64 w-full flex items-end gap-1.5 pt-4">
                                {chartData.map(d => (
                                    <div key={d.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                                        <div className="flex gap-0.5 w-full justify-center h-full items-end">
                                            <div
                                                className="w-1/2 rounded-t-sm transition-all duration-700"
                                                style={{ height: `${Math.max(2, (d.income / maxVal) * 100)}%`, background: '#2C7A4B', opacity: d.income > 0 ? 1 : 0.2 }}
                                                title={`${d.month}: ${d.income.toLocaleString('sv-SE')} kr`}
                                            />
                                            <div
                                                className="w-1/2 rounded-t-sm transition-all duration-700"
                                                style={{ height: `${Math.max(2, (d.expense / maxVal) * 100)}%`, background: '#C0392B', opacity: d.expense > 0 ? 1 : 0.2 }}
                                                title={`${d.month}: ${d.expense.toLocaleString('sv-SE')} kr`}
                                            />
                                        </div>
                                        <span className="text-[9px] text-muted-foreground mt-1">{d.month.substring(0, 3)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-6 mt-4 text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm" style={{ background: '#2C7A4B' }} />
                                    <span>{t('page.stats.label_income')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm" style={{ background: '#C0392B' }} />
                                    <span>{t('page.stats.label_expenses')}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Monthly summary table */}
            <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                <div className="flex items-center gap-2.5 px-6 py-4 border-b border-border font-semibold text-sm" style={{ background: '#F7F3EC' }}>
                    <TrendingUp size={16} style={{ color: '#C9A84C' }} />
                    {language === 'sv' ? 'Månadsöversikt' : 'Monthly overview'}
                </div>
                <div className="overflow-x-auto table-scroll-wrapper">
                    <table className="premium-table">
                        <thead>
                            <tr>
                                <th>{language === 'sv' ? 'Månad' : 'Month'}</th>
                                <th>{t('page.stats.label_income')}</th>
                                <th>{t('page.stats.label_expenses')}</th>
                                <th>{language === 'sv' ? 'Resultat' : 'Result'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <tr key={i}><td colSpan={4}><div className="h-4 bg-secondary rounded animate-pulse" /></td></tr>
                                ))
                            ) : chartData.filter(d => d.income > 0 || d.expense > 0).length > 0 ? (
                                chartData.filter(d => d.income > 0 || d.expense > 0).map(d => {
                                    const result = d.income - d.expense
                                    return (
                                        <tr key={d.month}>
                                            <td className="font-medium">{d.month}</td>
                                            <td style={{ color: '#2C7A4B' }} className="font-medium">+{d.income.toLocaleString('sv-SE')} kr</td>
                                            <td style={{ color: '#C0392B' }} className="font-medium">-{d.expense.toLocaleString('sv-SE')} kr</td>
                                            <td className="font-bold" style={{ color: result >= 0 ? '#2C7A4B' : '#C0392B' }}>
                                                {result >= 0 ? '+' : ''}{result.toLocaleString('sv-SE')} kr
                                            </td>
                                        </tr>
                                    )
                                })
                            ) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-12 text-muted-foreground">
                                        {language === 'sv' ? 'Ingen data tillgänglig' : 'No data available'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
