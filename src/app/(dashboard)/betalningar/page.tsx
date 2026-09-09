"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import {
    CreditCard, Search, Plus, RefreshCcw, CheckCircle2,
    AlertCircle, Clock, FileSpreadsheet, FileText, Mail, Bell
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format, isBefore, addDays, parseISO } from "date-fns"
import { sv, enUS } from "date-fns/locale"
import { PaymentForm } from "@/components/payment-form"
import { useLanguage } from "@/components/language-provider"
import { exportToExcel, exportToPDF } from "@/lib/export"
import { sendPaymentReminderAction } from "@/app/actions/email"
import { useActiveOrg } from "@/hooks/useActiveOrg"

export default function BetalningarPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const locale = language === 'sv' ? sv : enUS
    const { activeOrgId } = useActiveOrg()

    const [payments, setPayments] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [showForm, setShowForm] = useState(false)
    const [selectedPayment, setSelectedPayment] = useState<any>(null)
    const [exporting, setExporting] = useState(false)
    const [sendingReminder, setSendingReminder] = useState<string | null>(null)
    const [reminderFeedback, setReminderFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

    const fetchPayments = async () => {
        if (!supabase || !activeOrgId) return
        setLoading(true)
        const { data } = await supabase
            .from('familjer')
            .select(`
                id, familje_namn, make_namn, hustru_namn, mail,
                betalningar(id, total_manads_avgift, total_ars_avgift, summan, betalat_till_datum, betalat_via, betalnings_referens, created_at),
                barn(manads_avgift)
            `)
            .eq('organisation_id', activeOrgId)
            .order('familje_namn', { ascending: true })

        const processed = (data ?? []).map((f: any) => {
            const latest = f.betalningar?.sort((a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
            const adults = (f.make_namn ? 1 : 0) + (f.hustru_namn ? 1 : 0)
            const childFees = f.barn?.reduce((s: number, b: any) => s + (b.manads_avgift ?? 100), 0) ?? 0
            const calcMonthly = (adults * 200) + childFees
            return {
                id: f.id,
                betalning_id: latest?.id ?? null,
                familje_namn: f.familje_namn,
                make_namn: f.make_namn,
                hustru_namn: f.hustru_namn,
                mail: f.mail ?? null,
                monthly_fee: latest?.total_manads_avgift ?? calcMonthly,
                annual_fee: latest?.total_ars_avgift ?? (calcMonthly * 12),
                paid_sum: latest?.summan ?? 0,
                paid_until: latest?.betalat_till_datum ?? null,
                method: latest?.betalat_via ?? null,
                ref: latest?.betalnings_referens ?? null,
            }
        })
        setPayments(processed)
        setLoading(false)
    }

    useEffect(() => { fetchPayments() }, [supabase, activeOrgId])

    const getStatus = (paidUntil: string | null) => {
        if (!paidUntil) return { label: t('status.unpaid'), cls: 'badge-danger', icon: AlertCircle }
        const today = new Date()
        const until = parseISO(paidUntil)
        if (isBefore(until, today)) return { label: t('status.overdue'), cls: 'badge-danger', icon: AlertCircle }
        if (isBefore(until, addDays(today, 30))) return { label: t('status.soon_overdue'), cls: 'badge-warning', icon: Clock }
        return { label: t('status.up_to_date'), cls: 'badge-success', icon: CheckCircle2 }
    }

    // Status priority: overdue/unpaid = 0, soon = 1, paid = 2
    const statusPriority = (p: any): number => {
        if (!p.paid_until) return 0
        const today = new Date()
        const until = parseISO(p.paid_until)
        if (isBefore(until, today)) return 0
        if (isBefore(until, addDays(today, 30))) return 1
        return 2
    }

    const filteredPayments = payments
        .filter(p =>
            p.familje_namn?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.make_namn?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
        )
        .sort((a, b) => statusPriority(a) - statusPriority(b))

    // Stats
    const stats = useMemo(() => {
        const overdue = payments.filter(p => {
            if (!p.paid_until) return true
            return isBefore(parseISO(p.paid_until), new Date())
        }).length
        const upToDate = payments.filter(p => {
            if (!p.paid_until) return false
            return !isBefore(parseISO(p.paid_until), new Date())
        }).length
        return { total: payments.length, overdue, upToDate }
    }, [payments])

    const handleSendReminder = async (p: any) => {
        if (!p.mail) {
            setReminderFeedback({ id: p.id, ok: false, msg: t('reminder.no_email') })
            setTimeout(() => setReminderFeedback(null), 3000)
            return
        }
        setSendingReminder(p.id)
        const result = await sendPaymentReminderAction({
            recipientEmail: p.mail,
            familyName: p.familje_namn,
            makeNamn: p.make_namn,
            overdueDate: p.paid_until
                ? format(parseISO(p.paid_until), 'd MMM yyyy', { locale })
                : language === 'sv' ? 'Obetald' : 'Unpaid',
            familyId: p.id,
        })
        setSendingReminder(null)
        setReminderFeedback({
            id: p.id,
            ok: result.success,
            msg: result.success ? t('reminder.sent') : (result.error ?? t('reminder.error')),
        })
        setTimeout(() => setReminderFeedback(null), 4000)
    }

    const handleExcelExport = async () => {
        setExporting(true)
        try {
            const headers = [
                language === 'sv' ? 'Familjenamn' : 'Family Name',
                language === 'sv' ? 'Make' : 'Husband',
                language === 'sv' ? 'Månadsavgift' : 'Monthly Fee',
                language === 'sv' ? 'Årsavgift' : 'Annual Fee',
                language === 'sv' ? 'Betalt belopp' : 'Paid Amount',
                language === 'sv' ? 'Betalat till' : 'Paid Until',
                language === 'sv' ? 'Betalsätt' : 'Method',
                language === 'sv' ? 'Status' : 'Status',
            ]
            const rows = filteredPayments.map(p => {
                const { label } = getStatus(p.paid_until)
                return [
                    p.familje_namn, p.make_namn,
                    `${p.monthly_fee} kr`, `${p.annual_fee} kr`,
                    `${p.paid_sum} kr`,
                    p.paid_until ? format(parseISO(p.paid_until), 'yyyy-MM-dd') : '—',
                    p.method ?? '—', label,
                ]
            })
            await exportToExcel('Betalningar', language === 'sv' ? 'Betalningar' : 'Payments', headers, rows)
        } finally { setExporting(false) }
    }

    const handlePDFExport = async () => {
        setExporting(true)
        try {
            const headers = [
                language === 'sv' ? 'Familjenamn' : 'Family Name',
                language === 'sv' ? 'Månadsavgift' : 'Monthly Fee',
                language === 'sv' ? 'Betalat till' : 'Paid Until',
                language === 'sv' ? 'Status' : 'Status',
            ]
            const rows = filteredPayments.map(p => {
                const { label } = getStatus(p.paid_until)
                return [
                    p.familje_namn,
                    `${p.monthly_fee} kr`,
                    p.paid_until ? format(parseISO(p.paid_until), 'yyyy-MM-dd') : '—',
                    label,
                ]
            })
            await exportToPDF('Betalningar', language === 'sv' ? 'Betalningar' : 'Payments', headers, rows)
        } finally { setExporting(false) }
    }

    return (
        <div>
            {/* Header */}
            <div className="page-header flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('page.payments.title')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('page.payments.desc')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handleExcelExport} disabled={exporting || loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50">
                        <FileSpreadsheet size={15} style={{ color: '#2C7A4B' }} /> Excel
                    </button>
                    <button onClick={handlePDFExport} disabled={exporting || loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-50">
                        <FileText size={15} style={{ color: '#C0392B' }} /> PDF
                    </button>
                    <button onClick={fetchPayments} disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">
                        <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={() => { setSelectedPayment(null); setShowForm(true) }}
                        className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-primary-foreground"
                        style={{ background: '#1A1A1A' }}>
                        <Plus size={15} />
                        {t('page.payments.register')}
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5">
                <div className="stat-card">
                    <div className="stat-label">{language === 'sv' ? 'Totalt' : 'Total'}</div>
                    <div className="stat-value">{stats.total}</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid #C0392B' }}>
                    <div className="stat-label">{t('status.overdue')}</div>
                    <div className="stat-value" style={{ color: '#C0392B' }}>{stats.overdue}</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '3px solid #2C7A4B' }}>
                    <div className="stat-label">{t('status.up_to_date')}</div>
                    <div className="stat-value" style={{ color: '#2C7A4B' }}>{stats.upToDate}</div>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-5">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="text"
                    placeholder={t('page.payments.search')}
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
                                <th>{t('table.family')}</th>
                                <th>{t('table.monthly_fee')}</th>
                                <th>{t('table.yearly_fee')}</th>
                                <th>{t('table.paid_until')}</th>
                                <th>{t('table.status')}</th>
                                <th className="text-right">{t('table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 6 }).map((_, j) => (
                                            <td key={j}><div className="h-4 bg-secondary rounded animate-pulse w-3/4" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : filteredPayments.length > 0 ? (
                                filteredPayments.map(p => {
                                    const { label, cls, icon: Icon } = getStatus(p.paid_until)
                                    const isOverdue = cls === 'badge-danger'
                                    const fb = reminderFeedback?.id === p.id ? reminderFeedback : null
                                    return (
                                        <tr key={p.id}>
                                            <td>
                                                <div className="font-semibold">{p.familje_namn}</div>
                                                <div className="text-xs text-muted-foreground">{p.make_namn}</div>
                                            </td>
                                            <td>{p.monthly_fee.toLocaleString('sv-SE')} kr</td>
                                            <td>{p.annual_fee.toLocaleString('sv-SE')} kr</td>
                                            <td className="text-sm">
                                                {p.paid_until
                                                    ? format(parseISO(p.paid_until), 'd MMM yyyy', { locale })
                                                    : '—'}
                                            </td>
                                            <td>
                                                <span className={`badge ${cls}`}>
                                                    <Icon size={11} className="inline mr-1" />
                                                    {label}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex flex-col items-end gap-1">
                                                    {/* Inline feedback (success/error) */}
                                                    {fb && (
                                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${fb.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                            {fb.msg}
                                                        </span>
                                                    )}
                                                    <div className="flex items-center gap-1.5">
                                                        {/* Reminder button — only visible when overdue */}
                                                        {isOverdue && (
                                                            <button
                                                                onClick={() => handleSendReminder(p)}
                                                                disabled={sendingReminder === p.id}
                                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                                                                style={{
                                                                    background: '#FEF2F2',
                                                                    color: '#C0392B',
                                                                    border: '1px solid #FECACA',
                                                                }}
                                                                onMouseEnter={e => (e.currentTarget.style.background = '#FEE2E2')}
                                                                onMouseLeave={e => (e.currentTarget.style.background = '#FEF2F2')}
                                                                title={t('action.send_reminder')}
                                                            >
                                                                {sendingReminder === p.id
                                                                    ? <RefreshCcw size={12} className="animate-spin" />
                                                                    : <Bell size={12} />}
                                                                {language === 'sv' ? 'Påminnelse' : 'Reminder'}
                                                            </button>
                                                        )}
                                                        {/* Manage button */}
                                                        <button
                                                            onClick={() => {
                                                                setSelectedPayment({
                                                                    familj_id: p.id,
                                                                    total_manads_avgift: p.monthly_fee,
                                                                    total_ars_avgift: p.annual_fee,
                                                                    summan: p.monthly_fee,
                                                                })
                                                                setShowForm(true)
                                                            }}
                                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary-foreground"
                                                            style={{ background: '#1A1A1A' }}
                                                        >
                                                            <CreditCard size={12} />
                                                            {t('action.manage')}
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            ) : (
                                <tr>
                                    <td colSpan={6} className="text-center py-16 text-muted-foreground">
                                        <CreditCard size={40} className="mx-auto mb-3 opacity-20" />
                                        {t('table.empty_records')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showForm && (
                <PaymentForm
                    initialData={selectedPayment}
                    onClose={() => { setShowForm(false); setSelectedPayment(null) }}
                    onSuccess={() => { setShowForm(false); setSelectedPayment(null); fetchPayments() }}
                />
            )}
        </div>
    )
}
