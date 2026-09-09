"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    Users,
    CreditCard,
    TrendingDown,
    TrendingUp,
    BarChart3,
    LogOut,
    LayoutDashboard,
    Settings,
    UserCog,
    ScrollText,
    X,
    Menu,
    Globe,
    Building2,
    ArrowLeftRight,
    Shield,
} from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { useLanguage } from "@/components/language-provider"
import { useActiveOrg } from "@/hooks/useActiveOrg"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { logAuditAction } from "@/app/actions/audit"

const navItems = [
    { key: "nav.dashboard",  href: "/",            icon: LayoutDashboard },
    { key: "nav.register",   href: "/register",     icon: Users,       permission: "register" },
    { key: "nav.payments",   href: "/betalningar",  icon: CreditCard,  permission: "payments" },
    { key: "nav.expenses",   href: "/utgifter",     icon: TrendingDown,permission: "expenses" },
    { key: "nav.income",     href: "/intakter",     icon: TrendingUp,  permission: "income" },
    { key: "nav.stats",      href: "/statistik",    icon: BarChart3,   permission: "stats" },
    { key: "nav.settings",   href: "/installningar",icon: Settings,    permission: "settings" },
    { key: "nav.users",      href: "/anvandare",    icon: UserCog,     permission: "users" },
    { key: "nav.logs",       href: "/loggar",       icon: ScrollText,  permission: "users" },
]

function SidebarContent({ onClose }: { onClose?: () => void }) {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const pathname = usePathname()
    const router = useRouter()
    const { language, setLanguage, t } = useLanguage()
    const { activeOrgId, activeOrgName, activeOrgLogo, activeOrgColor } = useActiveOrg()
    const [adminTitle, setAdminTitle]   = useState("Kyrkoregistret")
    const [adminLogoUrl, setAdminLogoUrl] = useState<string | null>(null)
    const [adminLogoSize, setAdminLogoSize] = useState(32)
    const [userRole, setUserRole]             = useState("user")
    const [userPermissions, setUserPermissions] = useState<string[]>([])
    const [userEmail, setUserEmail] = useState("")

    useEffect(() => {
        if (!supabase || !activeOrgId) return

        const fetchSettings = async () => {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('admin_title, admin_logo_url, admin_logo_size')
                    .eq('organisation_id', activeOrgId)
                    .limit(1)
                    .single()
                if (data?.admin_title) setAdminTitle(data.admin_title)
                if (data?.admin_logo_url) setAdminLogoUrl(data.admin_logo_url)
                if (data?.admin_logo_size) setAdminLogoSize(data.admin_logo_size)
            } catch { /* ignore */ }
        }

        const fetchUserProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (user?.id) {
                    setUserEmail(user.email ?? "")
                    const { data } = await supabase
                        .from('user_profiles')
                        .select('role, permissions')
                        .eq('id', user.id)
                        .single()
                    if (data) {
                        setUserRole(data.role ?? "user")
                        setUserPermissions(data.permissions ?? [])
                    }
                }
            } catch { /* ignore */ }
        }

        fetchSettings()
        fetchUserProfile()
    }, [supabase, activeOrgId])

    const handleLogout = async () => {
        if (supabase) {
            await logAuditAction('logout', 'auth', '', { email: userEmail })
            await supabase.auth.signOut()
        }
        // Clear org cookie
        document.cookie = 'active_org_id=; path=/; max-age=0'
        router.push("/login")
    }

    const handleSwitchOrg = () => {
        // Clear org cookie and redirect to login for org selection
        document.cookie = 'active_org_id=; path=/; max-age=0'
        router.push("/login")
    }

    const isAllowed = (item: typeof navItems[0]) => {
        if (!item.permission) return true
        if (userRole === 'superadmin' || userRole === 'admin') return true
        if (item.permission === 'settings' || item.permission === 'users') return false
        return userPermissions.includes(item.permission)
    }

    return (
        <div className="flex h-full flex-col" style={{ background: '#1C1C1C' }}>
            {/* Header — logo stacked above name */}
            <div className="px-5 py-5 border-b" style={{ borderColor: '#2E2E2E' }}>
                <div className="flex items-start justify-between">
                    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                        {/* Logo */}
                        {adminLogoUrl ? (
                            <img
                                src={adminLogoUrl}
                                alt="Logo"
                                style={{ height: `${adminLogoSize}px`, maxWidth: '120px', objectFit: 'contain' }}
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #8B6914 100%)' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                    <path d="M2 17l10 5 10-5" />
                                    <path d="M2 12l10 5 10-5" />
                                </svg>
                            </div>
                        )}
                        {/* Name under logo */}
                        <span className="font-bold text-sm text-center leading-tight w-full truncate px-1"
                            style={{ color: '#F0EBE0' }}>
                            {adminTitle}
                        </span>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 transition-colors flex-shrink-0 mt-1" aria-label="Stäng meny">
                            <X size={18} style={{ color: '#B8AFA0' }} />
                        </button>
                    )}
                </div>
            </div>

            {/* Active org indicator */}
            {activeOrgName && (
                <div className="px-3 pt-3">
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px]" style={{ background: '#2A2A2A' }}>
                        {activeOrgLogo ? (
                            <img src={activeOrgLogo} alt="" className="w-6 h-6 rounded-md object-contain" />
                        ) : (
                            <Building2 size={14} style={{ color: activeOrgColor, flexShrink: 0 }} />
                        )}
                        <span className="text-xs font-medium truncate flex-1" style={{ color: '#F0EBE0' }}>
                            {activeOrgName}
                        </span>
                        <button
                            onClick={handleSwitchOrg}
                            className="p-1 rounded-md hover:bg-white/10 transition-colors flex-shrink-0"
                            title={language === 'sv' ? 'Byt organisation' : 'Switch organisation'}
                        >
                            <ArrowLeftRight size={12} style={{ color: '#C9A84C' }} />
                        </button>
                    </div>
                </div>
            )}

            {/* Nav items */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => {
                    if (!isAllowed(item)) return null
                    const Icon = item.icon
                    const isActive = item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href)

                    return (
                        <Link
                            key={item.key}
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                                "sidebar-item",
                                isActive && "active"
                            )}
                        >
                            <Icon size={17} />
                            <span>{t(item.key)}</span>
                        </Link>
                    )
                })}

                {/* Super Admin link for superadmins */}
                {userRole === 'superadmin' && (
                    <Link
                        href="/super-admin"
                        onClick={onClose}
                        className={cn(
                            "sidebar-item",
                            pathname.startsWith('/super-admin') && "active"
                        )}
                    >
                        <Shield size={17} />
                        <span>Super Admin</span>
                    </Link>
                )}
            </nav>

            {/* Footer */}
            <div className="px-3 pb-4 pt-2 border-t space-y-2" style={{ borderColor: '#2E2E2E' }}>
                {/* User badge */}
                {userEmail && (
                    <div className="px-3 py-2 rounded-[10px] mb-2" style={{ background: '#2A2A2A' }}>
                        <div className="text-xs font-medium truncate" style={{ color: '#C9A84C' }}>
                            {userRole.toUpperCase()}
                        </div>
                        <div className="text-xs truncate mt-0.5" style={{ color: '#8A8178' }}>
                            {userEmail}
                        </div>
                    </div>
                )}

                {/* Language selector */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-[10px]" style={{ background: '#2A2A2A' }}>
                    <Globe size={14} style={{ color: '#B8AFA0', flexShrink: 0 }} />
                    <select
                        className="bg-transparent text-xs flex-1 cursor-pointer focus:outline-none"
                        style={{ color: '#B8AFA0' }}
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as 'sv' | 'en')}
                        aria-label="Välj språk"
                    >
                        <option value="sv" style={{ background: '#2A2A2A' }}>Svenska</option>
                        <option value="en" style={{ background: '#2A2A2A' }}>English</option>
                    </select>
                </div>

                {/* Logout */}
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all"
                    style={{ color: '#E07070' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#3A1A1A')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                    <LogOut size={16} />
                    {t('nav.logout')}
                </button>
            </div>
        </div>
    )
}

export function Sidebar() {
    return <SidebarContent />
}

export function MobileSidebar() {
    const [open, setOpen] = useState(false)

    return (
        <>
            {/* Hamburger button */}
            <button
                onClick={() => setOpen(true)}
                className="fixed top-4 left-4 z-50 p-2.5 rounded-xl md:hidden"
                style={{ background: '#1C1C1C', color: '#F0EBE0' }}
                aria-label="Öppna meny"
            >
                <Menu size={20} />
            </button>

            {/* Backdrop */}
            {open && (
                <div
                    className="fixed inset-0 z-40 md:hidden"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setOpen(false)}
                />
            )}

            {/* Drawer */}
            <div
                className="fixed inset-y-0 left-0 z-50 w-64 md:hidden transition-transform duration-300"
                style={{ transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
            >
                <SidebarContent onClose={() => setOpen(false)} />
            </div>
        </>
    )
}
