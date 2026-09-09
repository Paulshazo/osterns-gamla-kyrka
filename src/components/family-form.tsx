"use client"

import { useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { X, Plus, Trash2, Loader2 } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { logAuditAction } from "@/app/actions/audit"
import { useActiveOrg } from "@/hooks/useActiveOrg"

interface FamilyFormProps {
    onClose: () => void
    onSuccess: () => void
    initialData?: any
}

const SSN_REGEX = /^\d{12}$/

export function FamilyForm({ onClose, onSuccess, initialData }: FamilyFormProps) {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const { activeOrgId } = useActiveOrg()
    const [loading, setLoading]                 = useState(false)
    const [error, setError]                     = useState<string | null>(null)
    const [validationErrors, setValidationErrors] = useState<string[]>([])
    const [confirmMsg, setConfirmMsg]           = useState<string | null>(null)
    const [pendingSubmit, setPendingSubmit]     = useState(false)

    const [familyData, setFamilyData] = useState({
        id:                   initialData?.id || undefined,
        familje_namn:         initialData?.familje_namn         || "",
        make_namn:            initialData?.make_namn            || "",
        make_personnummer:    initialData?.make_personnummer     || "",
        make_manads_avgift:   initialData?.make_manads_avgift   ?? 200,
        hustru_namn:          initialData?.hustru_namn          || "",
        hustru_personnummer:  initialData?.hustru_personnummer  || "",
        hustru_manads_avgift: initialData?.hustru_manads_avgift ?? 200,
        mobil_nummer:         initialData?.mobil_nummer         || "",
        mail:                 initialData?.mail                 || "",
        adress:               initialData?.adress               || "",
        ort:                  initialData?.ort                  || "",
        post_kod:             initialData?.post_kod             || "",
        land:                 initialData?.land                 || "Sverige",
    })

    const [children, setChildren] = useState<any[]>(
        (initialData?.children || []).map((c: any, i: number) => ({ ...c, _key: c.id || `child-${i}` }))
    )

    const set = (k: string, v: any) => setFamilyData(prev => ({ ...prev, [k]: v }))

    const addChild = () => {
        if (children.length >= 6) return
        setChildren(prev => [...prev, { _key: `child-${Date.now()}`, ordning: prev.length + 1, namn: "", personnummer: "", manads_avgift: 100 }])
    }

    const removeChild = (key: string) => {
        setChildren(prev => prev.filter(c => c._key !== key).map((c, i) => ({ ...c, ordning: i + 1 })))
    }

    const updateChild = (key: string, field: string, value: any) => {
        setChildren(prev => prev.map(c => c._key === key ? { ...c, [field]: value } : c))
    }

    const doSave = async () => {
        if (!supabase) return
        setLoading(true)
        setPendingSubmit(false)
        setConfirmMsg(null)
        try {
            const childrenPayload = children.map(({ _key, ...c }) => c)
            const familyPayload = { ...familyData, organisation_id: activeOrgId }
            if (familyData.id) {
                const { error: rpcError } = await supabase.rpc('update_family_with_children', {
                    p_family_id:   familyData.id,
                    family_data:   familyPayload,
                    children_data: childrenPayload,
                })
                if (rpcError) throw rpcError
                logAuditAction('update', 'family', String(familyData.id), { familje_namn: familyData.familje_namn })
            } else {
                const { data: newId, error: rpcError } = await supabase.rpc('add_family_with_children', {
                    family_data:   familyPayload,
                    children_data: childrenPayload,
                })
                if (rpcError) throw rpcError
                logAuditAction('create', 'family', String(newId ?? ''), { familje_namn: familyData.familje_namn })
            }
            onSuccess()
        } catch (err: any) {
            setError(err.message || t('form.family.error_save'))
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setValidationErrors([])
        setConfirmMsg(null)

        const errors: string[] = []
        if (!familyData.familje_namn?.trim()) errors.push('familje_namn')
        if (!familyData.mobil_nummer?.trim())  errors.push('mobil_nummer')
        if (!familyData.mail?.trim())           errors.push('mail')
        if (!familyData.adress?.trim())         errors.push('adress')
        if (!familyData.ort?.trim())            errors.push('ort')
        if (!familyData.post_kod?.trim())       errors.push('post_kod')

        const hasMake   = !!familyData.make_namn?.trim()
        const hasHustru = !!familyData.hustru_namn?.trim()

        if (!hasMake && !hasHustru) {
            errors.push('make_namn', 'hustru_namn')
        }
        if (hasMake && familyData.make_personnummer && !SSN_REGEX.test(familyData.make_personnummer)) {
            errors.push('make_personnummer')
        }
        if (hasHustru && familyData.hustru_personnummer && !SSN_REGEX.test(familyData.hustru_personnummer)) {
            errors.push('hustru_personnummer')
        }

        if (errors.length > 0) {
            setValidationErrors(errors)
            setError(t('form.family.error_mandatory'))
            return
        }

        // Show inline confirmation instead of window.confirm
        if (!hasMake && hasHustru) {
            setConfirmMsg(t('form.family.confirm_no_husband'))
            setPendingSubmit(true)
        } else if (hasMake && !hasHustru) {
            setConfirmMsg(t('form.family.confirm_no_wife'))
            setPendingSubmit(true)
        } else {
            await doSave()
        }
    }

    const isErr = (field: string) => validationErrors.includes(field)
    const inputCls = (field: string) =>
        `input-premium ${isErr(field) ? 'border-red-400 focus:border-red-400' : ''}`

    return (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '2rem', paddingBottom: '2rem', overflowY: 'auto' }}>
            <div className="modal-content w-full max-w-4xl">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-lg font-bold">{initialData ? t('form.family.edit_title') : t('form.family.add_title')}</h2>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-6 space-y-6">
                        {error && (
                            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-[10px] text-sm">{error}</div>
                        )}

                        {/* Inline confirmation */}
                        {confirmMsg && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-[10px] text-sm">
                                <p className="font-medium text-amber-800 mb-3">{confirmMsg}</p>
                                <div className="flex gap-3">
                                    <button type="button" onClick={() => { setConfirmMsg(null); setPendingSubmit(false) }}
                                        className="px-4 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">
                                        {t('common.cancel')}
                                    </button>
                                    <button type="button" onClick={doSave}
                                        className="px-4 py-2 rounded-[10px] text-sm font-semibold text-primary-foreground"
                                        style={{ background: '#1A1A1A' }}>
                                        {language === 'sv' ? 'Ja, fortsätt' : 'Yes, continue'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Contact info */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-sm border-b border-border pb-2 uppercase tracking-wider text-muted-foreground">
                                    {t('form.family.main_info')}
                                </h3>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">{t('form.family.family_name')}</label>
                                    <input className={inputCls('familje_namn')} value={familyData.familje_namn}
                                        onChange={e => set('familje_namn', e.target.value)} required />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold">{t('form.family.mobile')}</label>
                                        <input className={inputCls('mobil_nummer')} value={familyData.mobil_nummer}
                                            onChange={e => set('mobil_nummer', e.target.value)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold">{t('form.family.email')}</label>
                                        <input type="email" className={inputCls('mail')} value={familyData.mail}
                                            onChange={e => set('mail', e.target.value)} />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">{t('form.family.address')}</label>
                                    <input className={inputCls('adress')} value={familyData.adress}
                                        onChange={e => set('adress', e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold">{t('form.family.city')}</label>
                                        <input className={inputCls('ort')} value={familyData.ort}
                                            onChange={e => set('ort', e.target.value)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold">{t('form.family.zip')}</label>
                                        <input className={inputCls('post_kod')} value={familyData.post_kod}
                                            onChange={e => set('post_kod', e.target.value)} />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">{t('form.family.country')}</label>
                                    <select className="input-premium" value={familyData.land} onChange={e => set('land', e.target.value)}>
                                        <option value="Sverige">{t('form.family.country_sweden')}</option>
                                        <option value="Danmark">{t('form.family.country_denmark')}</option>
                                        <option value="Norge">{t('form.family.country_norway')}</option>
                                        <option value="Finland">{t('form.family.country_finland')}</option>
                                        <option value="Tyskland">{t('form.family.country_germany')}</option>
                                        <option value="USA">{t('form.family.country_usa')}</option>
                                        <option value="Storbritannien">{t('form.family.country_uk')}</option>
                                        <option value="Annat">{t('form.family.country_other')}</option>
                                    </select>
                                </div>
                            </div>

                            {/* Parents */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-sm border-b border-border pb-2 uppercase tracking-wider text-muted-foreground">
                                    {t('form.family.adults')}
                                </h3>
                                {/* Husband */}
                                <div className="p-4 rounded-[10px] border border-border bg-secondary/30 space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold" style={{ color: '#2C7A4B' }}>{t('form.family.husband_name')}</label>
                                        <input className={inputCls('make_namn')} value={familyData.make_namn}
                                            onChange={e => set('make_namn', e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground uppercase">{t('form.family.ssn')}</label>
                                            <input className={inputCls('make_personnummer')} maxLength={12} placeholder="ÅÅÅÅMMDDNNNN"
                                                value={familyData.make_personnummer}
                                                onChange={e => set('make_personnummer', e.target.value.replace(/\D/g, ''))} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground uppercase">{t('form.family.fee')} (kr)</label>
                                            <input type="number" className={inputCls('make_manads_avgift')} value={familyData.make_manads_avgift}
                                                onChange={e => set('make_manads_avgift', Number(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                </div>
                                {/* Wife */}
                                <div className="p-4 rounded-[10px] border border-border bg-secondary/30 space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold" style={{ color: '#C9A84C' }}>{t('form.family.wife_name')}</label>
                                        <input className={inputCls('hustru_namn')} value={familyData.hustru_namn}
                                            onChange={e => set('hustru_namn', e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground uppercase">{t('form.family.ssn')}</label>
                                            <input className={inputCls('hustru_personnummer')} maxLength={12} placeholder="ÅÅÅÅMMDDNNNN"
                                                value={familyData.hustru_personnummer}
                                                onChange={e => set('hustru_personnummer', e.target.value.replace(/\D/g, ''))} />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-muted-foreground uppercase">{t('form.family.fee')} (kr)</label>
                                            <input type="number" className="input-premium" value={familyData.hustru_manads_avgift}
                                                onChange={e => set('hustru_manads_avgift', Number(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Children */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-border pb-2">
                                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                                    {t('form.family.children_max')}
                                </h3>
                                <button type="button" onClick={addChild} disabled={children.length >= 6}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold border border-border hover:bg-secondary transition-colors disabled:opacity-40">
                                    <Plus size={12} /> {t('form.family.add_child')}
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {children.map((child, index) => (
                                    <div key={child._key} className="p-4 rounded-[10px] border border-border bg-secondary/30 relative">
                                        <button type="button" onClick={() => removeChild(child._key)}
                                            className="absolute top-3 right-3 p-1 rounded hover:bg-red-50 transition-colors"
                                            aria-label={language === 'sv' ? 'Ta bort barn' : 'Remove child'}>
                                            <Trash2 size={12} style={{ color: '#C0392B' }} />
                                        </button>
                                        <div className="space-y-2.5 pr-6">
                                            <div className="space-y-1">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase">
                                                    {t('form.family.child_name')} {index + 1}
                                                </label>
                                                <input className="input-premium" placeholder={t('form.family.child_placeholder')}
                                                    value={child.namn} onChange={e => updateChild(child._key, 'namn', e.target.value)} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <label className="text-xs font-semibold text-muted-foreground uppercase">{t('form.family.ssn')}</label>
                                                    <input className="input-premium" maxLength={12} placeholder="ÅÅÅÅMMDDNNNN"
                                                        value={child.personnummer}
                                                        onChange={e => updateChild(child._key, 'personnummer', e.target.value.replace(/\D/g, ''))} />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs font-semibold text-muted-foreground uppercase">{t('form.family.fee')}</label>
                                                    <input type="number" className="input-premium" value={child.manads_avgift}
                                                        onChange={e => updateChild(child._key, 'manads_avgift', Number(e.target.value) || 0)} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {children.length === 0 && (
                                    <div className="col-span-full py-8 text-center border-2 border-dashed border-border rounded-[10px] text-muted-foreground text-sm">
                                        {t('form.family.no_children')}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 p-6 border-t border-border sticky bottom-0 bg-card/90 backdrop-blur-sm">
                        <button type="button" onClick={onClose} disabled={loading}
                            className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={loading || pendingSubmit}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-sm font-semibold text-primary-foreground disabled:opacity-60"
                            style={{ background: '#1A1A1A' }}>
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            {loading ? t('form.family.saving') : (initialData ? t('form.family.btn_update') : t('form.family.btn_save'))}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
