"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { X, Mail, CheckCircle2 } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { sendPaymentReceiptAction } from "@/app/actions/email"
import { logAuditAction } from "@/app/actions/audit"
import { useActiveOrg } from "@/hooks/useActiveOrg"
import {
    calculatePaymentPeriod,
    describePaymentPeriod,
    familyMemberCounts,
    familyMonthlyFee,
} from "@/lib/payment-period"

interface PaymentFormProps {
    onClose: () => void
    onSuccess: () => void
    initialData?: any
    selectedFamilyId?: string | null
}

export function PaymentForm({ onClose, onSuccess, initialData, selectedFamilyId }: PaymentFormProps) {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const { activeOrgId, canEdit } = useActiveOrg()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [families, setFamilies] = useState<any[]>([])
    const [selectedFamilyData, setSelectedFamilyData] = useState<any>(null)

    // Receipt email feature
    const [sendReceipt, setSendReceipt] = useState(false)
    const [receiptEmail, setReceiptEmail] = useState("")
    const [receiptStatus, setReceiptStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

    const [formData, setFormData] = useState({
        id:                   initialData?.id ?? undefined,
        familj_id:            initialData?.familj_id ?? selectedFamilyId ?? "",
        total_manads_avgift:  initialData?.total_manads_avgift ?? 0,
        total_ars_avgift:     initialData?.total_ars_avgift ?? 0,
        summan:               initialData?.summan ?? 0,
        betalat_till_datum:   initialData?.betalat_till_datum ?? "",
        betalat_via:          initialData?.betalat_via ?? "Swish",
        betalnings_referens:  initialData?.betalnings_referens ?? "",
    })
    const [previousPaidUntil, setPreviousPaidUntil] = useState<string | null>(null)
    const [memberCounts, setMemberCounts] = useState({ adults: 0, children: 0, total: 0 })

    useEffect(() => {
        if (!supabase || !activeOrgId) return
        const fetchFamilies = async () => {
            const { data } = await supabase
                .from('familjer')
                .select('id, familje_namn, make_namn, hustru_namn, mail')
                .eq('organisation_id', activeOrgId)
                .order('familje_namn')
            if (data) setFamilies(data)
        }
        fetchFamilies()
    }, [supabase, activeOrgId])

    // When family changes, auto-fill email if available
    useEffect(() => {
        if (formData.familj_id) {
            const fam = families.find(f => f.id === formData.familj_id)
            if (fam) {
                setSelectedFamilyData(fam)
                if (fam.mail && !receiptEmail) setReceiptEmail(fam.mail)
            }
        }
    }, [formData.familj_id, families])

    const loadFamilyPeriod = async (familjId: string, resetAmount = true) => {
        if (!supabase || !familjId) return
        try {
            const [{ data: family }, { data: children }, { data: latestPayments }] = await Promise.all([
                supabase.from('familjer').select('*').eq('id', familjId).single(),
                supabase.from('barn').select('*').eq('familj_id', familjId),
                supabase
                    .from('betalningar')
                    .select('id, betalat_till_datum')
                    .eq('familj_id', familjId)
                    .not('betalat_till_datum', 'is', null)
                    .order('betalat_till_datum', { ascending: false })
                    .limit(5),
            ])
            if (!family) return

            const monthly = familyMonthlyFee({ ...family, barn: children ?? [] })
            const counts = familyMemberCounts({ ...family, barn: children ?? [] })
            const previous = (latestPayments ?? []).find(p => p.id !== formData.id)?.betalat_till_datum ?? null
            setMemberCounts(counts)
            setPreviousPaidUntil(previous)
            setSelectedFamilyData(family)
            if (family.mail && !receiptEmail) setReceiptEmail(family.mail)

            setFormData(prev => {
                const amount = resetAmount || !prev.summan ? monthly : prev.summan
                const period = calculatePaymentPeriod({
                    amount,
                    monthlyFee: monthly,
                    previousUntil: previous,
                    adults: counts.adults,
                    children: counts.children,
                })
                return {
                    ...prev,
                    familj_id: familjId,
                    total_manads_avgift: monthly,
                    total_ars_avgift: period.annualFee,
                    summan: amount,
                    betalat_till_datum: period.validUntilIso,
                }
            })
        } catch { /* ignore */ }
    }

    useEffect(() => {
        const familyId = formData.familj_id
        if (!familyId || !supabase) return
        loadFamilyPeriod(familyId, !formData.id && !initialData?.summan)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supabase, formData.familj_id])

    const handleFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value
        setFormData(prev => ({ ...prev, familj_id: id }))
    }

    const applyPeriod = (amount: number, monthlyFee: number) => {
        const period = calculatePaymentPeriod({
            amount,
            monthlyFee,
            previousUntil: previousPaidUntil,
            adults: memberCounts.adults,
            children: memberCounts.children,
        })
        return {
            total_manads_avgift: monthlyFee,
            total_ars_avgift: period.annualFee,
            summan: amount,
            betalat_till_datum: period.validUntilIso,
        }
    }

    const periodPreview = calculatePaymentPeriod({
        amount: formData.summan,
        monthlyFee: formData.total_manads_avgift,
        previousUntil: previousPaidUntil,
        adults: memberCounts.adults,
        children: memberCounts.children,
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canEdit('payments')) {
            setError(language === 'sv' ? 'Du har inte behörighet att redigera betalningar.' : 'You are not allowed to edit payments.')
            return
        }
        if (!supabase || !formData.familj_id) {
            setError(t('form.payment.error_select_family'))
            return
        }
        setLoading(true)
        setError(null)
        try {
            let newPaymentId: string | null = null

            if (formData.id) {
                const { error: err } = await supabase
                    .from('betalningar')
                    .update({
                        familj_id: formData.familj_id,
                        total_manads_avgift: formData.total_manads_avgift,
                        total_ars_avgift: formData.total_ars_avgift,
                        summan: formData.summan,
                        betalat_till_datum: formData.betalat_till_datum,
                        betalat_via: formData.betalat_via,
                        betalnings_referens: formData.betalnings_referens,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', formData.id)
                if (err) throw err
                newPaymentId = formData.id
                logAuditAction('update', 'payment', String(formData.id), {
                    familj_id: formData.familj_id,
                    summan: formData.summan,
                    betalat_via: formData.betalat_via,
                })
            } else {
                const { data, error: err } = await supabase
                    .from('betalningar')
                    .insert([{
                        familj_id: formData.familj_id,
                        total_manads_avgift: formData.total_manads_avgift,
                        total_ars_avgift: formData.total_ars_avgift,
                        summan: formData.summan,
                        betalat_till_datum: formData.betalat_till_datum,
                        betalat_via: formData.betalat_via,
                        betalnings_referens: formData.betalnings_referens,
                        organisation_id: activeOrgId,
                    }])
                    .select()
                if (err) throw err
                newPaymentId = data?.[0]?.id ?? null
                logAuditAction('create', 'payment', String(newPaymentId ?? ''), {
                    familj_id: formData.familj_id,
                    summan: formData.summan,
                    betalat_via: formData.betalat_via,
                })
            }

            // Send receipt if requested
            if (sendReceipt && receiptEmail && newPaymentId && selectedFamilyData) {
                setReceiptStatus('sending')
                const result = await sendPaymentReceiptAction({
                    recipientEmail: receiptEmail,
                    recipientName: selectedFamilyData.make_namn ?? selectedFamilyData.familje_namn,
                    familyName: selectedFamilyData.familje_namn,
                    makeNamn: selectedFamilyData.make_namn ?? '',
                    hustru_namn: selectedFamilyData.hustru_namn ?? null,
                    amount: formData.summan,
                    paidVia: formData.betalat_via,
                    validUntil: formData.betalat_till_datum,
                    reference: formData.betalnings_referens || null,
                    betalningId: newPaymentId,
                })
                setReceiptStatus(result.success ? 'sent' : 'error')
            }

            setTimeout(() => onSuccess(), receiptStatus === 'sending' ? 1500 : 300)
        } catch (err: any) {
            setError(err.message ?? t('form.payment.error_save'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content max-w-lg">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-lg font-bold">
                        {initialData ? t('form.payment.edit_title') : t('form.payment.add_title')}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-4">
                        {error && (
                            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-[10px] border border-destructive/20">
                                {error}
                            </div>
                        )}

                        {/* Family selector */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">{t('form.payment.family_label')}</label>
                            <select
                                className="input-premium"
                                value={formData.familj_id}
                                onChange={handleFamilyChange}
                                disabled={!!initialData || !!selectedFamilyId}
                                required
                            >
                                <option value="">{t('form.payment.family_placeholder')}</option>
                                {families.map(f => (
                                    <option key={f.id} value={f.id}>
                                        {f.familje_namn} ({f.make_namn ?? f.hustru_namn ?? ''})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Fees */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-muted-foreground">{t('form.payment.est_monthly')}</label>
                                <input
                                    type="number"
                                    className="input-premium"
                                    value={formData.total_manads_avgift}
                                    onChange={(e) => {
                                        const monthly = Number(e.target.value) || 0
                                        setFormData(prev => ({ ...prev, ...applyPeriod(prev.summan, monthly) }))
                                    }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-muted-foreground">{t('form.payment.est_yearly')}</label>
                                <input
                                    type="number"
                                    className="input-premium"
                                    value={formData.total_ars_avgift}
                                    onChange={(e) => {
                                        const yearly = Number(e.target.value) || 0
                                        const monthly = Math.round(yearly / 12)
                                        setFormData(prev => ({ ...prev, ...applyPeriod(prev.summan, monthly) }))
                                    }}
                                />
                            </div>
                        </div>

                        {/* Paid amount + method */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{t('form.payment.paid_amount')}</label>
                                <input
                                    type="number"
                                    className="input-premium"
                                    required
                                    value={formData.summan}
                                    onChange={(e) => {
                                        const amount = Number(e.target.value) || 0
                                        setFormData(prev => ({ ...prev, ...applyPeriod(amount, prev.total_manads_avgift) }))
                                    }}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{t('form.payment.paid_via')}</label>
                                <select
                                    className="input-premium"
                                    value={formData.betalat_via}
                                    onChange={(e) => setFormData(prev => ({ ...prev, betalat_via: e.target.value }))}
                                    required
                                >
                                    <option value="Swish">{t('form.payment.swish')}</option>
                                    <option value="Bank Överföring">{t('form.payment.bank_transfer')}</option>
                                    <option value="Kontant">{t('form.payment.cash')}</option>
                                    <option value="Annat">{t('form.payment.other')}</option>
                                </select>
                            </div>
                        </div>

                        {/* Valid until */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">{t('form.payment.valid_until')}</label>
                            <input
                                type="date"
                                className="input-premium"
                                required
                                value={formData.betalat_till_datum}
                                onChange={(e) => setFormData(prev => ({ ...prev, betalat_till_datum: e.target.value }))}
                            />
                            {formData.familj_id && formData.total_manads_avgift > 0 && (
                                <div className="rounded-[10px] border p-3 text-xs leading-relaxed" style={{ background: '#FFF8EE', borderColor: '#FCD34D', color: '#78350F' }}>
                                    <p className="font-semibold mb-1">{t('form.payment.period_title')}</p>
                                    <p>{describePaymentPeriod(periodPreview, language === 'sv' ? 'sv' : 'en')}</p>
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground">{t('form.payment.valid_auto')}</p>
                        </div>

                        {/* Reference */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">{t('form.payment.ref')}</label>
                            <input
                                className="input-premium"
                                value={formData.betalnings_referens}
                                onChange={(e) => setFormData(prev => ({ ...prev, betalnings_referens: e.target.value }))}
                                placeholder={t('form.payment.ref_placeholder')}
                            />
                        </div>

                        {/* Email receipt section */}
                        <div className="rounded-[10px] border border-border p-4 space-y-3" style={{ background: '#F7F3EC' }}>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={sendReceipt}
                                    onChange={(e) => setSendReceipt(e.target.checked)}
                                    className="w-4 h-4 rounded accent-current"
                                    style={{ accentColor: '#C9A84C' }}
                                />
                                <span className="text-sm font-semibold flex items-center gap-1.5">
                                    <Mail size={14} style={{ color: '#C9A84C' }} />
                                    {t('form.payment.send_receipt')}
                                </span>
                            </label>
                            {sendReceipt && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">
                                        {t('form.payment.receipt_email')}
                                    </label>
                                    <input
                                        type="email"
                                        className="input-premium text-sm"
                                        value={receiptEmail}
                                        onChange={(e) => setReceiptEmail(e.target.value)}
                                        placeholder="mottagare@exempel.se"
                                    />
                                </div>
                            )}
                            {receiptStatus === 'sent' && (
                                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#2C7A4B' }}>
                                    <CheckCircle2 size={14} />
                                    {t('form.payment.receipt_sent')}
                                </div>
                            )}
                            {receiptStatus === 'error' && (
                                <div className="text-sm text-destructive">{t('form.payment.receipt_error')}</div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 p-6 pt-0">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-primary-foreground disabled:opacity-60 flex items-center justify-center gap-2"
                            style={{ background: '#1A1A1A' }}
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                                    </svg>
                                    {t('form.payment.saving')}
                                </>
                            ) : t('form.payment.btn_save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
