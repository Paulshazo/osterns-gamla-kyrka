"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { Save, Loader2, Mail, Image as ImageIcon, Shield, Eye, EyeOff, Type } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { useActiveOrg } from "@/hooks/useActiveOrg"
import { logAuditAction } from "@/app/actions/audit"

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

export default function SettingsPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t, language } = useLanguage()
    const { activeOrgId } = useActiveOrg()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [currentUserRole, setCurrentUserRole] = useState("user")
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [showApiKey, setShowApiKey] = useState(false)

    const [settings, setSettings] = useState({
        admin_title:       "",
        admin_logo_url:    "",
        admin_logo_size:   32,
        login_title:       "",
        login_subtitle:    "",
        login_logo_url:    "",
        login_logo_size:   64,
        resend_api_key:    "",
        resend_from_email: "",
        resend_from_name:  "Kyrkoregistret",
    })
    // Track which columns actually exist in the DB
    const [hasResendColumns, setHasResendColumns] = useState(false)

    const [uploadingAdmin, setUploadingAdmin] = useState(false)
    const [uploadingLogin, setUploadingLogin] = useState(false)

    useEffect(() => {
        if (!supabase) return
        const init = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user?.id) {
                    const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
                    if (data?.role) setCurrentUserRole(data.role)
                }
            } catch { /* ignore */ }

            try {
                // Load org-specific settings (fall back to id=1 for backward compatibility)
                let query = supabase
                    .from('app_settings')
                    .select('admin_title, admin_logo_url, admin_logo_size, login_title, login_subtitle, login_logo_url, login_logo_size')
                if (activeOrgId) {
                    query = query.eq('organisation_id', activeOrgId)
                } else {
                    query = query.eq('id', 1)
                }
                const { data, error } = await query.single()
                if (data) {
                    setSettings(prev => ({
                        ...prev,
                        admin_title:     data.admin_title     ?? "",
                        admin_logo_url:  data.admin_logo_url  ?? "",
                        admin_logo_size: data.admin_logo_size ?? 32,
                        login_title:     data.login_title     ?? "",
                        login_subtitle:  data.login_subtitle  ?? "",
                        login_logo_url:  data.login_logo_url  ?? "",
                        login_logo_size: data.login_logo_size ?? 64,
                    }))
                }
                if (error) console.warn('app_settings load:', error.message)
            } catch { /* ignore */ }

            // Try to load Resend columns separately — they may not exist yet
            try {
                let resendQuery = supabase
                    .from('app_settings')
                    .select('resend_api_key, resend_from_email, resend_from_name')
                if (activeOrgId) {
                    resendQuery = resendQuery.eq('organisation_id', activeOrgId)
                } else {
                    resendQuery = resendQuery.eq('id', 1)
                }
                const { data, error } = await resendQuery.single()
                if (!error && data) {
                    setHasResendColumns(true)
                    setSettings(prev => ({
                        ...prev,
                        resend_api_key:    data.resend_api_key    ?? "",
                        resend_from_email: data.resend_from_email ?? "",
                        resend_from_name:  data.resend_from_name  ?? "Kyrkoregistret",
                    }))
                }
            } catch { /* columns not yet created */ }

            setLoading(false)
        }
        init()
    }, [supabase])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!supabase) return
        setSaving(true)
        setMessage(null)
        try {
            // Step 1: Save base settings (always works)
            const basePayload: Record<string, any> = {
                admin_title:     settings.admin_title,
                admin_logo_url:  settings.admin_logo_url,
                admin_logo_size: settings.admin_logo_size,
                login_title:     settings.login_title,
                login_subtitle:  settings.login_subtitle,
                login_logo_url:  settings.login_logo_url,
                login_logo_size: settings.login_logo_size,
                updated_at:      new Date().toISOString(),
            }
            if (activeOrgId) {
                basePayload.organisation_id = activeOrgId
            } else {
                basePayload.id = 1
            }
            const { error: baseError } = await supabase.from('app_settings').upsert(basePayload)
            if (baseError) throw baseError

            // Step 2: Save Resend settings only if columns exist
            if (hasResendColumns) {
                const resendPayload: Record<string, any> = {
                    resend_api_key:    settings.resend_api_key    || null,
                    resend_from_email: settings.resend_from_email || null,
                    resend_from_name:  settings.resend_from_name  || 'Kyrkoregistret',
                    updated_at:        new Date().toISOString(),
                }
                if (activeOrgId) {
                    resendPayload.organisation_id = activeOrgId
                } else {
                    resendPayload.id = 1
                }
                const { error: resendError } = await supabase.from('app_settings').upsert(resendPayload)
                if (resendError) {
                    // Columns still missing — show migration hint
                    setMessage({
                        type: 'error',
                        text: language === 'sv'
                            ? 'E-postkonfiguration kunde inte sparas — kör SQL-patchen 01_patch_app_settings_columns.sql i Supabase SQL-editorn.'
                            : 'Email config could not be saved — run SQL patch 01_patch_app_settings_columns.sql in the Supabase SQL editor.',
                    })
                    setSaving(false)
                    return
                }
            }

            logAuditAction('settings', 'settings', '1', { admin_title: settings.admin_title })
            setMessage({ type: 'success', text: t('page.settings.saved') })
            setTimeout(() => window.location.reload(), 1200)
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message ?? t('page.settings.error') })
        } finally {
            setSaving(false)
        }
    }

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'admin' | 'login') => {
        if (!supabase) return
        const file = event.target.files?.[0]
        if (!file) return

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setMessage({ type: 'error', text: language === 'sv' ? 'Ogiltig filtyp. Tillåtna: JPG, PNG, GIF, WebP, SVG.' : 'Invalid file type. Allowed: JPG, PNG, GIF, WebP, SVG.' })
            return
        }
        if (file.size > MAX_FILE_SIZE) {
            setMessage({ type: 'error', text: language === 'sv' ? 'Filen är för stor (max 2MB).' : 'File too large (max 2MB).' })
            return
        }

        if (type === 'admin') setUploadingAdmin(true)
        else setUploadingLogin(true)

        try {
            const ext = file.name.split('.').pop()
            const path = `logo/${type}_logo_${Date.now()}.${ext}`
            const { error } = await supabase.storage.from('public_assets').upload(path, file, { upsert: true })
            if (error) throw error
            const { data } = supabase.storage.from('public_assets').getPublicUrl(path)
            setSettings(prev => ({
                ...prev,
                [type === 'admin' ? 'admin_logo_url' : 'login_logo_url']: data.publicUrl,
            }))
            setMessage({ type: 'success', text: language === 'sv' ? 'Logotyp uppladdad!' : 'Logo uploaded!' })
        } catch (err: any) {
            setMessage({ type: 'error', text: `Upload failed: ${err.message}` })
        } finally {
            if (type === 'admin') setUploadingAdmin(false)
            else setUploadingLogin(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="animate-spin" size={20} />
                    {t('common.loading')}
                </div>
            </div>
        )
    }

    if (currentUserRole === 'user') {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="text-center">
                    <Shield size={48} style={{ color: '#DDD8CE' }} className="mx-auto mb-4" />
                    <h2 className="text-xl font-bold">{language === 'sv' ? 'Åtkomst nekad' : 'Access denied'}</h2>
                    <p className="text-muted-foreground mt-2">{language === 'sv' ? 'Du måste vara admin för att ändra inställningar.' : 'You must be admin to change settings.'}</p>
                </div>
            </div>
        )
    }

    const set = (k: string, v: any) => setSettings(prev => ({ ...prev, [k]: v }))

    return (
        <div className="max-w-4xl">
            <div className="page-header">
                <h1 className="text-2xl font-bold tracking-tight">{t('page.settings.title')}</h1>
                <p className="text-muted-foreground text-sm mt-1">{t('page.settings.desc')}</p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                {/* DB migration warning — show if Resend columns are missing */}
                {!hasResendColumns && (
                    <div className="p-4 rounded-[10px] border text-sm" style={{ background: '#FFF8EE', borderColor: '#FCD34D', color: '#92400E' }}>
                        <p className="font-bold mb-1">
                            {language === 'sv' ? '⚠️ Databas-patch krävs' : '⚠️ Database patch required'}
                        </p>
                        <p>
                            {language === 'sv'
                                ? 'E-postkolumnerna saknas i databasen. Kör filen '
                                : 'Email columns are missing from the database. Run the file '}
                            <code className="font-mono bg-amber-100 px-1 rounded">
                                supabase/migrations/01_patch_app_settings_columns.sql
                            </code>
                            {language === 'sv' ? ' i Supabase SQL-editorn för att aktivera e-postfunktionerna.' : ' in the Supabase SQL editor to enable email features.'}
                        </p>
                    </div>
                )}

                {message && (
                    <div className={`p-4 rounded-[10px] text-sm border font-medium ${
                        message.type === 'success'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                        {message.text}
                    </div>
                )}

                {/* ── Adminpanelens logotyp & namn ─────────────────────── */}
                <SectionCard icon={<ImageIcon size={16} />} title={language === 'sv' ? 'Adminpanelens logotyp & namn' : 'Admin panel logo & name'}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left: inputs */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold flex items-center gap-1.5">
                                    <Type size={13} style={{ color: '#C9A84C' }} />
                                    {language === 'sv' ? 'Organisationsnamn' : 'Organization name'}
                                </label>
                                <input
                                    className="input-premium"
                                    value={settings.admin_title}
                                    onChange={(e) => set('admin_title', e.target.value)}
                                    placeholder="Kyrkoregistret"
                                />
                                <p className="text-xs text-muted-foreground">
                                    {language === 'sv' ? 'Visas under logotypen i sidofältet.' : 'Displayed under the logo in the sidebar.'}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">
                                    {language === 'sv' ? 'Logotypstorlek' : 'Logo size'} — {settings.admin_logo_size}px
                                </label>
                                <input
                                    type="range" min="16" max="100"
                                    value={settings.admin_logo_size}
                                    onChange={(e) => set('admin_logo_size', Number(e.target.value))}
                                    className="w-full accent-gold"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{t('page.settings.upload_logo')}</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                                        onChange={(e) => handleFileUpload(e, 'admin')}
                                        disabled={uploadingAdmin}
                                        className="input-premium cursor-pointer text-sm"
                                    />
                                    {uploadingAdmin && <Loader2 className="animate-spin flex-shrink-0" size={16} />}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {language === 'sv' ? 'Max 2MB · JPG, PNG, GIF, WebP, SVG' : 'Max 2MB · JPG, PNG, GIF, WebP, SVG'}
                                </p>
                            </div>
                        </div>

                        {/* Right: live preview — logo ABOVE name */}
                        <div className="flex flex-col items-center justify-center rounded-[14px] p-6 gap-3"
                            style={{ background: '#1C1C1C', minHeight: '160px' }}>
                            <p className="text-xs mb-2" style={{ color: '#6B6355' }}>
                                {language === 'sv' ? 'Förhandsvisning' : 'Preview'}
                            </p>
                            {settings.admin_logo_url ? (
                                <img
                                    src={settings.admin_logo_url}
                                    alt="Admin logo preview"
                                    style={{ height: settings.admin_logo_size, maxWidth: '120px', objectFit: 'contain' }}
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                            ) : (
                                <div className="rounded-xl flex items-center justify-center"
                                    style={{ width: settings.admin_logo_size, height: settings.admin_logo_size, background: 'linear-gradient(135deg,#C9A84C,#8B6914)' }}>
                                    <svg width={settings.admin_logo_size * 0.5} height={settings.admin_logo_size * 0.5} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                    </svg>
                                </div>
                            )}
                            {/* Name under logo */}
                            <span className="font-bold text-sm text-center" style={{ color: '#F0EBE0' }}>
                                {settings.admin_title || 'Kyrkoregistret'}
                            </span>
                        </div>
                    </div>
                </SectionCard>

                {/* ── Inloggningssidans logotyp & texter ───────────────── */}
                <SectionCard icon={<ImageIcon size={16} />} title={language === 'sv' ? 'Inloggningssidans logotyp & texter' : 'Login page logo & texts'}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Inputs */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{language === 'sv' ? 'Huvudrubrik' : 'Main heading'}</label>
                                <input
                                    className="input-premium"
                                    value={settings.login_title}
                                    onChange={(e) => set('login_title', e.target.value)}
                                    placeholder="Välkommen"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{language === 'sv' ? 'Underrubrik' : 'Subtitle'}</label>
                                <input
                                    className="input-premium"
                                    value={settings.login_subtitle}
                                    onChange={(e) => set('login_subtitle', e.target.value)}
                                    placeholder="Logga in på kyrkoregistret"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">
                                    {language === 'sv' ? 'Logotypstorlek' : 'Logo size'} — {settings.login_logo_size}px
                                </label>
                                <input
                                    type="range" min="32" max="200"
                                    value={settings.login_logo_size}
                                    onChange={(e) => set('login_logo_size', Number(e.target.value))}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold">{t('page.settings.upload_logo')} ({language === 'sv' ? 'inloggning' : 'login'})</label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                                        onChange={(e) => handleFileUpload(e, 'login')}
                                        disabled={uploadingLogin}
                                        className="input-premium cursor-pointer text-sm"
                                    />
                                    {uploadingLogin && <Loader2 className="animate-spin flex-shrink-0" size={16} />}
                                </div>
                            </div>
                        </div>

                        {/* Preview — logo above name */}
                        <div className="flex flex-col items-center justify-center rounded-[14px] p-6 gap-2"
                            style={{ background: '#18181B', minHeight: '180px' }}>
                            <p className="text-xs mb-1" style={{ color: '#6B6355' }}>
                                {language === 'sv' ? 'Förhandsvisning' : 'Preview'}
                            </p>
                            {settings.login_logo_url ? (
                                <img
                                    src={settings.login_logo_url}
                                    alt="Login logo preview"
                                    style={{ height: Math.min(settings.login_logo_size, 80), maxWidth: '160px', objectFit: 'contain' }}
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                            ) : (
                                <div className="rounded-2xl flex items-center justify-center"
                                    style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#C9A84C,#8B6914)' }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                    </svg>
                                </div>
                            )}
                            <span className="font-bold text-lg text-center mt-1" style={{ color: '#FEFCF8' }}>
                                {settings.login_title || 'Välkommen'}
                            </span>
                            <span className="text-xs text-center" style={{ color: '#8A8178' }}>
                                {settings.login_subtitle || 'Logga in på kyrkoregistret'}
                            </span>
                        </div>
                    </div>
                </SectionCard>

                {/* ── E-post via Resend ──────────────────────────────────── */}
                <SectionCard icon={<Mail size={16} />} title={language === 'sv' ? 'E-post via Resend' : 'Email via Resend'} accent>
                    {!hasResendColumns ? (
                        /* Migration required — fields are locked */
                        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                                style={{ background: '#FEF3C7' }}>
                                🔧
                            </div>
                            <p className="font-semibold text-sm" style={{ color: '#92400E' }}>
                                {language === 'sv' ? 'Databas-patch behövs' : 'Database patch needed'}
                            </p>
                            <p className="text-xs max-w-sm" style={{ color: '#78350F' }}>
                                {language === 'sv'
                                    ? 'Kör SQL-filen nedan i Supabase SQL-editorn, sedan ladda om sidan.'
                                    : 'Run the SQL file below in the Supabase SQL editor, then reload.'}
                            </p>
                            <code className="text-xs px-3 py-1.5 rounded-lg font-mono"
                                style={{ background: '#FEF9C3', color: '#713F12' }}>
                                supabase/migrations/01_patch_app_settings_columns.sql
                            </code>
                        </div>
                    ) : (
                    <>
                    <div className="mb-5 p-4 rounded-[10px] border" style={{ background: '#FFFBEB', borderColor: '#FCD34D' }}>
                        <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
                            {language === 'sv' ? 'Hur det fungerar' : 'How it works'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#78350F' }}>
                            {language === 'sv'
                                ? 'Systemet använder Resend för att skicka kvitton och påminnelser. Hämta din API-nyckel på resend.com/api-keys och välj en avsändardress från din verifierade domän.'
                                : 'The system uses Resend to send receipts and reminders. Get your API key at resend.com/api-keys and choose a sender from your verified domain.'}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* API key — full width */}
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-semibold">{t('page.settings.resend_api_key')}</label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    className="input-premium pr-10 font-mono text-sm"
                                    value={settings.resend_api_key}
                                    onChange={(e) => set('resend_api_key', e.target.value)}
                                    placeholder="re_xxxxxxxxxxxxxxxxxxxx"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label={showApiKey ? 'Dölj API-nyckel' : 'Visa API-nyckel'}
                                >
                                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer"
                                    className="underline hover:text-foreground transition-colors">
                                    resend.com/api-keys
                                </a>
                            </p>
                        </div>

                        {/* From email */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">{t('page.settings.resend_from_email')}</label>
                            <input
                                type="email"
                                className="input-premium"
                                value={settings.resend_from_email}
                                onChange={(e) => set('resend_from_email', e.target.value)}
                                placeholder="noreply@dinkyrka.se"
                            />
                            <p className="text-xs text-muted-foreground">
                                {language === 'sv' ? 'Måste vara en verifierad domän i Resend.' : 'Must be a verified domain in Resend.'}
                            </p>
                        </div>

                        {/* From name */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">{t('page.settings.resend_from_name')}</label>
                            <input
                                className="input-premium"
                                value={settings.resend_from_name}
                                onChange={(e) => set('resend_from_name', e.target.value)}
                                placeholder="Kyrkoregistret"
                            />
                            <p className="text-xs text-muted-foreground">
                                {language === 'sv' ? 'Avsändarnamn som visas i e-postklienten.' : 'Sender name shown in the email client.'}
                            </p>
                        </div>
                    </div>
                    </>
                    )}
                </SectionCard>

                {/* Save */}
                <div className="flex justify-end pb-6">
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-3 rounded-[10px] font-semibold text-primary-foreground disabled:opacity-60 transition-all shadow-sm"
                        style={{ background: saving ? '#6B6355' : '#1A1A1A' }}
                    >
                        {saving ? (
                            <><Loader2 className="animate-spin" size={16} /> {language === 'sv' ? 'Sparar...' : 'Saving...'}</>
                        ) : (
                            <><Save size={16} /> {t('page.settings.save')}</>
                        )}
                    </button>
                </div>
            </form>
        </div>
    )
}

function SectionCard({
    icon, title, children, accent = false
}: {
    icon: React.ReactNode
    title: string
    children: React.ReactNode
    accent?: boolean
}) {
    return (
        <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
            <div
                className="flex items-center gap-2.5 px-6 py-4 border-b border-border font-semibold text-sm"
                style={{ background: accent ? '#FFF8EE' : '#F7F3EC' }}
            >
                <span style={{ color: accent ? '#C9A84C' : '#C9A84C' }}>{icon}</span>
                <span>{title}</span>
                {accent && (
                    <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: '#FEF3C7', color: '#92400E' }}>
                        API
                    </span>
                )}
            </div>
            <div className="p-6">
                {children}
            </div>
        </div>
    )
}
