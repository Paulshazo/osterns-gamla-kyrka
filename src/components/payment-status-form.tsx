"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { X } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { logAuditAction } from "@/app/actions/audit"
import { useActiveOrg } from "@/hooks/useActiveOrg"

type Props = {
    familyId: string
    familyName: string
    currentPaidUntil: string | null
    currentlyUnpaid: boolean
    onClose: () => void
    onSuccess: () => void
}

export function PaymentStatusForm({
    familyId,
    familyName,
    currentPaidUntil,
    currentlyUnpaid,
    onClose,
    onSuccess,
}: Props) {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const { canEdit } = useActiveOrg()
    const [status, setStatus] = useState<'unpaid' | 'paid'>(currentlyUnpaid ? 'unpaid' : 'paid')
    const [paidUntil, setPaidUntil] = useState(currentPaidUntil ?? '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canEdit('payments')) {
            setError(language === 'sv' ? 'Du har inte behörighet att redigera betalningar.' : 'You are not allowed to edit payments.')
            return
        }
        if (status === 'paid' && !paidUntil) {
            setError(t('form.status.error_date'))
            return
        }
        if (!supabase) return
        setLoading(true)
        setError(null)
        const payload = status === 'unpaid'
            ? { manuell_obetald: true, manuell_betalat_till: null }
            : { manuell_obetald: false, manuell_betalat_till: paidUntil }

        let { error: err } = await supabase.rpc('set_family_payment_status', {
            p_family_id: familyId,
            p_manuell_obetald: payload.manuell_obetald,
            p_manuell_betalat_till: payload.manuell_betalat_till,
        })
        if (err && /set_family_payment_status|function|schema cache|does not exist/i.test(err.message)) {
            const retry = await supabase.from('familjer').update(payload).eq('id', familyId)
            err = retry.error
        }
        if (err) {
            setLoading(false)
            if (/manuell_obetald|manuell_betalat_till|schema cache|column|set_family_payment_status|does not exist/i.test(err.message)) {
                setError(t('form.status.error_sql'))
            } else {
                setError(err.message)
            }
            return
        }
        logAuditAction('update', 'payment_status', familyId, {
            familje_namn: familyName,
            ...payload,
        })
        setLoading(false)
        onSuccess()
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-lg font-bold">{t('form.status.title')}</h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
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
                        <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{familyName}</p>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">{t('table.status')}</label>
                            <div className="flex gap-2">
                                {(['unpaid', 'paid'] as const).map(value => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setStatus(value)}
                                        className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border transition-colors"
                                        style={status === value
                                            ? { background: value === 'unpaid' ? '#C0392B' : '#2C7A4B', color: 'white', borderColor: 'transparent' }
                                            : { background: 'white', color: '#6B6355', borderColor: '#E5E0D8' }}
                                    >
                                        {value === 'unpaid' ? t('status.unpaid') : t('status.up_to_date')}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {status === 'paid' && (
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{t('table.paid_until')}</label>
                                <input
                                    type="date"
                                    className="input-premium"
                                    required
                                    value={paidUntil}
                                    onChange={e => setPaidUntil(e.target.value)}
                                />
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">{t('form.status.hint')}</p>
                    </div>
                    <div className="flex gap-3 p-6 pt-0">
                        <button type="button" onClick={onClose} disabled={loading}
                            className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={loading}
                            className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-primary-foreground disabled:opacity-60"
                            style={{ background: '#1A1A1A' }}>
                            {loading ? t('common.loading') : t('common.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
