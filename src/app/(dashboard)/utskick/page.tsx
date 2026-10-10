"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { Mail, RefreshCcw, Search, Send, Shield, Users } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { useActiveOrg } from "@/hooks/useActiveOrg"
import { sendMemberMailAction } from "@/app/actions/email"

type Contact = {
    id: string
    familje_namn: string
    make_namn: string | null
    hustru_namn: string | null
    mail: string | null
}

function hasValidEmail(value: string | null | undefined) {
    return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
}

export default function UtskickPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const { activeOrgId, canManageUsers, loading: orgLoading } = useActiveOrg()
    const canSend = canManageUsers

    const [contacts, setContacts] = useState<Contact[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [mode, setMode] = useState<'all' | 'selected'>('all')
    const [selected, setSelected] = useState<Record<string, boolean>>({})
    const [subject, setSubject] = useState("")
    const [body, setBody] = useState("")
    const [sender, setSender] = useState<{ email: string; name: string } | null>(null)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<string | null>(null)

    const fetchData = async () => {
        if (!supabase || !activeOrgId) return
        setLoading(true)
        const [{ data: families }, { data: settings }] = await Promise.all([
            supabase
                .from('familjer')
                .select('id, familje_namn, make_namn, hustru_namn, mail')
                .eq('organisation_id', activeOrgId)
                .order('familje_namn', { ascending: true }),
            supabase
                .from('app_settings')
                .select('resend_from_email, resend_from_name')
                .eq('organisation_id', activeOrgId)
                .limit(1)
                .maybeSingle(),
        ])
        setContacts(families ?? [])
        if (settings?.resend_from_email) {
            setSender({
                email: settings.resend_from_email,
                name: settings.resend_from_name || '',
            })
        } else {
            setSender(null)
        }
        setLoading(false)
    }

    useEffect(() => { fetchData() }, [supabase, activeOrgId])

    const withEmail = contacts.filter(c => hasValidEmail(c.mail))
    const withoutEmail = contacts.filter(c => !hasValidEmail(c.mail))
    const filtered = contacts.filter(c => {
        const q = search.toLowerCase()
        return !q
            || c.familje_namn.toLowerCase().includes(q)
            || (c.make_namn?.toLowerCase().includes(q) ?? false)
            || (c.hustru_namn?.toLowerCase().includes(q) ?? false)
            || (c.mail?.toLowerCase().includes(q) ?? false)
    })
    const selectedIds = Object.entries(selected).filter(([, on]) => on).map(([id]) => id)
    const selectedWithEmail = selectedIds.filter(id => hasValidEmail(contacts.find(c => c.id === id)?.mail))
    const recipientCount = mode === 'all' ? withEmail.length : selectedWithEmail.length

    const toggle = (id: string) => {
        setSelected(prev => ({ ...prev, [id]: !prev[id] }))
        setMode('selected')
    }

    const selectAllWithEmail = () => {
        const next: Record<string, boolean> = {}
        for (const contact of withEmail) next[contact.id] = true
        setSelected(next)
        setMode('selected')
    }

    const clearSelection = () => setSelected({})

    const handleSend = async () => {
        setError(null)
        setResult(null)
        if (!canSend) {
            setError(t('page.mailings.error_permission'))
            return
        }
        if (!sender) {
            setError(t('page.mailings.error_sender'))
            return
        }
        if (!subject.trim() || !body.trim()) {
            setError(t('page.mailings.error_fields'))
            return
        }
        if (recipientCount === 0) {
            setError(t('page.mailings.error_recipients'))
            return
        }
        const confirmText = language === 'sv'
            ? `Skicka till ${recipientCount} ${recipientCount === 1 ? 'medlem' : 'medlemmar'}?`
            : `Send to ${recipientCount} ${recipientCount === 1 ? 'member' : 'members'}?`
        if (!window.confirm(confirmText)) return

        setSending(true)
        const response = await sendMemberMailAction({
            subject: subject.trim(),
            body: body.trim(),
            mode,
            familyIds: mode === 'selected' ? selectedWithEmail : undefined,
        })
        setSending(false)
        if (!response.success) {
            setError(response.error)
            return
        }
        const extra = response.failed
            ? (language === 'sv'
                ? ` ${response.failed} kunde inte skickas.`
                : ` ${response.failed} could not be sent.`)
            : ''
        setResult(
            language === 'sv'
                ? `Skickade till ${response.sent} medlemmar.${extra}`
                : `Sent to ${response.sent} members.${extra}`,
        )
        setSubject("")
        setBody("")
        setSelected({})
    }

    if (orgLoading) {
        return (
            <div className="flex items-center justify-center h-[50vh] text-muted-foreground gap-3">
                <RefreshCcw size={18} className="animate-spin" />
                {t('common.loading')}
            </div>
        )
    }

    if (!canManageUsers) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="text-center">
                    <Shield size={48} style={{ color: '#DDD8CE' }} className="mx-auto mb-4" />
                    <h2 className="text-xl font-bold">{language === 'sv' ? 'Åtkomst nekad' : 'Access denied'}</h2>
                    <p className="text-muted-foreground mt-2">{t('page.mailings.error_permission')}</p>
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className="page-header flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('page.mailings.title')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('page.mailings.desc')}</p>
                </div>
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors"
                >
                    <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3">
                    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-border flex items-center gap-2 font-semibold text-sm">
                            <Mail size={16} style={{ color: '#C9A84C' }} />
                            {t('page.mailings.compose')}
                        </div>
                        <div className="p-5 space-y-4">
                            {error && (
                                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-[10px] text-sm">{error}</div>
                            )}
                            {result && (
                                <div className="p-3 bg-green-50 text-green-800 border border-green-200 rounded-[10px] text-sm">{result}</div>
                            )}

                            <div className="rounded-[10px] border border-border p-3 text-sm" style={{ background: '#F7F3EC' }}>
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                                    {t('page.mailings.sender')}
                                </div>
                                {sender ? (
                                    <div className="font-medium">
                                        {sender.name ? `${sender.name} <${sender.email}>` : sender.email}
                                    </div>
                                ) : (
                                    <div className="text-destructive">{t('page.mailings.error_sender')}</div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold">{t('page.mailings.recipients')}</label>
                                <div className="flex gap-2">
                                    {(['all', 'selected'] as const).map(value => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setMode(value)}
                                            className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border transition-colors"
                                            style={mode === value
                                                ? { background: '#1A1A1A', color: 'white', borderColor: 'transparent' }
                                                : { background: 'white', color: '#6B6355', borderColor: '#E5E0D8' }}
                                        >
                                            {value === 'all' ? t('page.mailings.to_all') : t('page.mailings.to_selected')}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t('page.mailings.will_send').replace('{count}', String(recipientCount))}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{t('page.mailings.subject')}</label>
                                <input
                                    className="input-premium"
                                    value={subject}
                                    maxLength={200}
                                    onChange={e => setSubject(e.target.value)}
                                    placeholder={t('page.mailings.subject_placeholder')}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{t('page.mailings.body')}</label>
                                <textarea
                                    className="input-premium min-h-[220px] resize-y"
                                    value={body}
                                    maxLength={20000}
                                    onChange={e => setBody(e.target.value)}
                                    placeholder={t('page.mailings.body_placeholder')}
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handleSend}
                                disabled={sending || !canSend || !sender}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-sm font-semibold text-primary-foreground disabled:opacity-60"
                                style={{ background: '#1A1A1A' }}
                            >
                                <Send size={15} />
                                {sending ? t('page.mailings.sending') : t('page.mailings.send')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2">
                    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-semibold text-sm">
                                <Users size={16} style={{ color: '#C9A84C' }} />
                                {t('page.mailings.contacts')}
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {withEmail.length}/{contacts.length}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="relative">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    className="input-premium pl-9"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={t('page.mailings.search')}
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={selectAllWithEmail}
                                    className="flex-1 py-1.5 rounded-[10px] text-xs font-semibold border border-border hover:bg-secondary"
                                >
                                    {t('page.mailings.select_all')}
                                </button>
                                <button
                                    type="button"
                                    onClick={clearSelection}
                                    className="flex-1 py-1.5 rounded-[10px] text-xs font-semibold border border-border hover:bg-secondary"
                                >
                                    {t('page.mailings.clear')}
                                </button>
                            </div>
                            <div className="max-h-[520px] overflow-y-auto divide-y divide-border rounded-[10px] border border-border">
                                {loading ? (
                                    <div className="p-6 text-sm text-muted-foreground text-center">{t('common.loading')}</div>
                                ) : filtered.length === 0 ? (
                                    <div className="p-6 text-sm text-muted-foreground text-center">{t('page.mailings.empty')}</div>
                                ) : (
                                    filtered.map(contact => {
                                        const ok = hasValidEmail(contact.mail)
                                        const checked = mode === 'all' ? ok : Boolean(selected[contact.id])
                                        return (
                                            <label
                                                key={contact.id}
                                                className={`flex items-start gap-3 p-3 text-sm ${ok ? 'cursor-pointer hover:bg-secondary/50' : 'opacity-50 cursor-not-allowed'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-1"
                                                    style={{ accentColor: '#C9A84C' }}
                                                    disabled={!ok}
                                                    checked={checked}
                                                    onChange={() => ok && toggle(contact.id)}
                                                />
                                                <span className="min-w-0">
                                                    <span className="block font-medium">{contact.familje_namn}</span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        {contact.make_namn || contact.hustru_namn || t('register.sibling_household')}
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground truncate">
                                                        {ok ? contact.mail : t('page.mailings.no_email')}
                                                    </span>
                                                </span>
                                            </label>
                                        )
                                    })
                                )}
                            </div>
                            {withoutEmail.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {t('page.mailings.missing_email').replace('{count}', String(withoutEmail.length))}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
