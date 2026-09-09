"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { useLanguage } from "@/components/language-provider"
import { Search, ScrollText, RefreshCw, User, LogIn, LogOut, Plus, Edit2, Trash2, Download, Mail, Shield } from "lucide-react"
import { useActiveOrg } from "@/hooks/useActiveOrg"
import { format } from "date-fns"
import { sv, enUS } from "date-fns/locale"

type AuditLog = {
    id: string
    user_id: string | null
    user_email: string | null
    action: string
    resource: string | null
    resource_id: string | null
    details: Record<string, unknown>
    ip_address: string | null
    created_at: string
}

const ACTION_CONFIG: Record<string, { label_sv: string; label_en: string; icon: React.ReactNode; color: string }> = {
    login:       { label_sv: 'Inloggning',   label_en: 'Login',        icon: <LogIn size={13} />,    color: '#2C7A4B' },
    logout:      { label_sv: 'Utloggning',   label_en: 'Logout',       icon: <LogOut size={13} />,   color: '#6B6355' },
    create:      { label_sv: 'Skapad',       label_en: 'Created',      icon: <Plus size={13} />,     color: '#2980B9' },
    update:      { label_sv: 'Uppdaterad',   label_en: 'Updated',      icon: <Edit2 size={13} />,    color: '#C9A84C' },
    delete:      { label_sv: 'Raderad',      label_en: 'Deleted',      icon: <Trash2 size={13} />,   color: '#C0392B' },
    export:      { label_sv: 'Export',       label_en: 'Export',       icon: <Download size={13} />, color: '#8B6914' },
    email_sent:  { label_sv: 'E-post',       label_en: 'Email sent',   icon: <Mail size={13} />,     color: '#6B4CA8' },
    settings:    { label_sv: 'Inställning',  label_en: 'Setting',      icon: <Shield size={13} />,   color: '#1A1A1A' },
}

function ActionBadge({ action, language }: { action: string; language: string }) {
    const cfg = ACTION_CONFIG[action] ?? { label_sv: action, label_en: action, icon: null, color: '#6B6355' }
    const label = language === 'sv' ? cfg.label_sv : cfg.label_en
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ background: cfg.color + '18', color: cfg.color }}>
            {cfg.icon}
            {label}
        </span>
    )
}

export default function LoggarPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const locale = language === 'sv' ? sv : enUS
    const { activeOrgId } = useActiveOrg()

    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [filterAction, setFilterAction] = useState("all")
    const [currentUserRole, setCurrentUserRole] = useState("user")

    const fetchLogs = async () => {
        if (!supabase || !activeOrgId) return
        setLoading(true)
        try {
            const { data } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('organisation_id', activeOrgId)
                .order('created_at', { ascending: false })
                .limit(500)
            setLogs(data ?? [])
        } catch { /* ignore */ } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!supabase) return
        const init = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user?.id) {
                    const { data } = await supabase
                        .from('user_profiles')
                        .select('role')
                        .eq('id', user.id)
                        .single()
                    if (data?.role) setCurrentUserRole(data.role)
                }
            } catch { /* ignore */ }
        }
        init()
        fetchLogs()
    }, [supabase])

    if (currentUserRole === 'user') {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="text-center">
                    <Shield size={48} style={{ color: '#DDD8CE' }} className="mx-auto mb-4" />
                    <h2 className="text-xl font-bold">Åtkomst nekad</h2>
                    <p className="text-muted-foreground mt-2">Du har inte behörighet att se aktivitetsloggar.</p>
                </div>
            </div>
        )
    }

    const filtered = logs.filter(log => {
        const matchSearch = !search ||
            (log.user_email?.toLowerCase().includes(search.toLowerCase())) ||
            (log.action?.toLowerCase().includes(search.toLowerCase())) ||
            (log.resource?.toLowerCase().includes(search.toLowerCase()))
        const matchAction = filterAction === 'all' || log.action === filterAction
        return matchSearch && matchAction
    })

    return (
        <div>
            {/* Page header */}
            <div className="page-header flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('page.logs.title')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('page.logs.desc')}</p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors"
                    disabled={loading}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    {language === 'sv' ? 'Uppdatera' : 'Refresh'}
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={language === 'sv' ? 'Sök användare, åtgärd...' : 'Search user, action...'}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input-premium pl-9"
                    />
                </div>
                <select
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                    className="input-premium w-auto min-w-[160px]"
                >
                    <option value="all">{language === 'sv' ? 'Alla åtgärder' : 'All actions'}</option>
                    {Object.entries(ACTION_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>
                            {language === 'sv' ? cfg.label_sv : cfg.label_en}
                        </option>
                    ))}
                </select>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                    { label: language === 'sv' ? 'Totalt' : 'Total', value: logs.length, color: '#1A1A1A' },
                    { label: language === 'sv' ? 'Inloggningar' : 'Logins', value: logs.filter(l => l.action === 'login').length, color: '#2C7A4B' },
                    { label: language === 'sv' ? 'Ändringar' : 'Changes', value: logs.filter(l => ['create','update','delete'].includes(l.action)).length, color: '#C9A84C' },
                    { label: language === 'sv' ? 'E-post' : 'Emails', value: logs.filter(l => l.action === 'email_sent').length, color: '#6B4CA8' },
                ].map(s => (
                    <div key={s.label} className="stat-card">
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value" style={{ color: s.color, fontSize: '1.5rem' }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
                        <RefreshCw size={18} className="animate-spin" />
                        {language === 'sv' ? 'Laddar loggar...' : 'Loading logs...'}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <ScrollText size={40} className="mx-auto mb-3 opacity-30" />
                        {t('table.logs.empty')}
                    </div>
                ) : (
                    <div className="overflow-x-auto table-scroll-wrapper">
                        <table className="premium-table">
                            <thead>
                                <tr>
                                    <th>{t('table.logs.time')}</th>
                                    <th>{t('table.logs.user')}</th>
                                    <th>{t('table.logs.action')}</th>
                                    <th>{t('table.logs.resource')}</th>
                                    <th>{t('table.logs.details')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(log => (
                                    <tr key={log.id}>
                                        <td className="whitespace-nowrap text-xs text-muted-foreground">
                                            {format(new Date(log.created_at), 'dd MMM yyyy HH:mm', { locale })}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                                    style={{ background: '#EDE8DF', color: '#1A1A1A' }}>
                                                    {log.user_email?.charAt(0).toUpperCase() ?? '?'}
                                                </div>
                                                <span className="text-sm text-muted-foreground">
                                                    {log.user_email ?? '—'}
                                                </span>
                                            </div>
                                        </td>
                                        <td><ActionBadge action={log.action} language={language} /></td>
                                        <td className="text-sm">
                                            {log.resource ? (
                                                <span className="font-medium capitalize">{log.resource}</span>
                                            ) : '—'}
                                            {log.resource_id && (
                                                <span className="text-xs text-muted-foreground ml-1">
                                                    #{log.resource_id.slice(0, 8)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-xs text-muted-foreground max-w-xs">
                                            {log.details && Object.keys(log.details).length > 0
                                                ? JSON.stringify(log.details).slice(0, 80)
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {filtered.length > 0 && (
                <p className="text-xs text-muted-foreground text-right mt-3">
                    {language === 'sv' ? `Visar ${filtered.length} av ${logs.length} poster` : `Showing ${filtered.length} of ${logs.length} entries`}
                </p>
            )}
        </div>
    )
}
