"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { LogIn, Eye, EyeOff } from "lucide-react"
import { logAuditAction } from "@/app/actions/audit"
import { setActiveOrganisation } from "@/app/actions/org"
import OrgSelector from "./org-selector"

type Step = "credentials" | "select-org"

interface OrgOption {
    id: string
    name: string
    slug: string
    logo_url?: string | null
    primary_color?: string
    member_role: string
}

export default function LoginPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])

    const [step, setStep] = useState<Step>("credentials")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loginTitle, setLoginTitle] = useState("Välkommen")
    const [loginSubtitle, setLoginSubtitle] = useState("Logga in på kyrkoregistret")
    const [loginLogoUrl, setLoginLogoUrl] = useState<string | null>(null)
    const [loginLogoSize, setLoginLogoSize] = useState(64)
    const [organisations, setOrganisations] = useState<OrgOption[]>([])
    const [isSuperAdmin, setIsSuperAdmin] = useState(false)

    useEffect(() => {
        if (!supabase) return
        const fetchSettings = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('login_title, login_subtitle, login_logo_url, login_logo_size')
                    .limit(1)
                    .single()
                if (data) {
                    if (data.login_title) setLoginTitle(data.login_title)
                    if (data.login_subtitle) setLoginSubtitle(data.login_subtitle)
                    if (data.login_logo_url) setLoginLogoUrl(data.login_logo_url)
                    if (data.login_logo_size) setLoginLogoSize(data.login_logo_size)
                }
            } catch { /* ignore */ }
        }
        fetchSettings()
    }, [supabase])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!supabase) {
            setError("Konfigurationsfel: Supabase-miljövariabler saknas.")
            return
        }
        if (password.length < 6) {
            setError("Lösenordet måste vara minst 6 tecken.")
            return
        }
        setLoading(true)
        setError(null)
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
            if (signInError) throw signInError

            // Audit log (fire & forget)
            logAuditAction('login', 'auth', '', { email })

            // Get user profile CLIENT-SIDE (session is now active in client)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Kunde inte hämta användare efter inloggning.")

            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('id', user.id)
                .single()

            const userIsSuperAdmin = profile?.role === 'superadmin'
            setIsSuperAdmin(userIsSuperAdmin)

            // Fetch organisations CLIENT-SIDE (not server action — avoids cookie timing issue)
            let orgs: OrgOption[] = []

            if (userIsSuperAdmin) {
                // Superadmin sees ALL orgs
                const { data: allOrgs } = await supabase
                    .from('organisations')
                    .select('id, name, slug, logo_url, primary_color')
                    .eq('is_active', true)
                    .order('name')
                orgs = (allOrgs ?? []).map(o => ({ ...o, member_role: 'superadmin' }))
            } else {
                // Regular user — fetch via memberships
                const { data: memberships } = await supabase
                    .from('organisation_members')
                    .select('role, organisations(id, name, slug, logo_url, primary_color, is_active)')
                    .eq('user_id', user.id)
                    .eq('is_active', true)

                orgs = (memberships ?? [])
                    .filter((m: any) => m.organisations?.is_active)
                    .map((m: any) => ({
                        id: m.organisations.id,
                        name: m.organisations.name,
                        slug: m.organisations.slug,
                        logo_url: m.organisations.logo_url,
                        primary_color: m.organisations.primary_color,
                        member_role: m.role,
                    }))
            }

            if (orgs.length === 0) {
                if (userIsSuperAdmin) {
                    window.location.href = "/super-admin"
                    return
                }
                setError("Du tillhör ingen organisation. Kontakta en administratör.")
                setLoading(false)
                return
            }

            if (orgs.length === 1 && !userIsSuperAdmin) {
                // Single org — auto-select
                await setActiveOrganisation(orgs[0].id)
                window.location.href = "/register"
                return
            }

            // Multiple orgs or superadmin — show org selector
            setOrganisations(orgs)
            setStep("select-org")
            setLoading(false)
        } catch (err: any) {
            setError(err.message || "Felaktigt e-post eller lösenord.")
            setLoading(false)
        }
    }

    const handleBackToLogin = () => {
        setStep("credentials")
        setError(null)
        supabase?.auth.signOut()
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4"
            style={{ background: 'linear-gradient(135deg, #F7F3EC 0%, #EDE8DF 50%, #E0D8CC 100%)' }}>

            <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-20 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #C9A84C 0%, transparent 70%)', transform: 'translate(-40%, -40%)' }} />
            <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #1A1A1A 0%, transparent 70%)', transform: 'translate(40%, 40%)' }} />

            <div className="relative w-full max-w-md">
                <div className="bg-card border border-border rounded-[24px] shadow-2xl overflow-hidden">
                    <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #C9A84C 0%, #8B6914 100%)' }} />

                    <div className="p-8">
                        {step === "credentials" ? (
                            <>
                                <div className="text-center mb-8">
                                    {loginLogoUrl ? (
                                        <div className="flex justify-center mb-4">
                                            <img src={loginLogoUrl} alt="Logo"
                                                style={{ height: `${loginLogoSize}px`, maxWidth: '200px', objectFit: 'contain' }} />
                                        </div>
                                    ) : (
                                        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                                            style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #8B6914 100%)' }}>
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                                <path d="M2 17l10 5 10-5" />
                                                <path d="M2 12l10 5 10-5" />
                                            </svg>
                                        </div>
                                    )}
                                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#1A1A1A' }}>
                                        {loginTitle}
                                    </h1>
                                    <p className="text-sm mt-1" style={{ color: '#6B6355' }}>
                                        {loginSubtitle}
                                    </p>
                                </div>

                                <form onSubmit={handleLogin} className="space-y-5">
                                    {error && (
                                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-[10px] border border-destructive/20">
                                            {error}
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label htmlFor="email" className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                                            E-postadress
                                        </label>
                                        <input id="email" type="email" placeholder="namn@exempel.se"
                                            value={email} onChange={(e) => setEmail(e.target.value)}
                                            required className="input-premium" autoComplete="email" />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label htmlFor="password" className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                                            Lösenord
                                        </label>
                                        <div className="relative">
                                            <input id="password" type={showPassword ? "text" : "password"}
                                                value={password} onChange={(e) => setPassword(e.target.value)}
                                                required minLength={6} className="input-premium pr-10" autoComplete="current-password" />
                                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}>
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    <button type="submit" disabled={loading}
                                        className="w-full h-11 rounded-[10px] font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                        style={{ background: loading ? '#6B6355' : 'linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 100%)', color: '#FEFCF8' }}>
                                        {loading ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
                                                </svg>
                                                Loggar in...
                                            </>
                                        ) : (
                                            <><LogIn size={16} /> Logga in</>
                                        )}
                                    </button>
                                </form>

                                <p className="text-center text-xs mt-6" style={{ color: '#A09080' }}>
                                    Kyrkoregistret — Säkert & Krypterat
                                </p>
                            </>
                        ) : (
                            <OrgSelector
                                organisations={organisations}
                                onBack={handleBackToLogin}
                                isSuperAdmin={isSuperAdmin}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
