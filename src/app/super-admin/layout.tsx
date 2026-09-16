import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { isPlatformRole, isSuperAdminRole } from "@/lib/permissions"
import Link from "next/link"
import { Settings } from "lucide-react"

export const dynamic = 'force-dynamic'

export default async function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!isPlatformRole(profile?.role)) redirect('/')

    const isAdmin = isSuperAdminRole(profile?.role)
    const roleLabel = isAdmin ? 'Super Admin' : 'Super användare'

    return (
        <div className="min-h-screen" style={{ background: '#F7F3EC' }}>
            <header className="sticky top-0 z-40 border-b" style={{ background: '#1A1A1A', borderColor: '#2E2E2E' }}>
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #8B6914 100%)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-sm font-bold truncate" style={{ color: '#F0EBE0' }}>Super Admin Panel</h1>
                            <p className="text-xs truncate" style={{ color: '#8A8178' }}>
                                {isAdmin ? 'Global organisationshantering' : 'Bevakning · endast läsning'} · {roleLabel}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                            href="/super-admin/installningar"
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                            style={{ background: '#2A2A2A', color: '#C9A84C' }}
                        >
                            <Settings size={13} />
                            Inställningar
                        </Link>
                        <Link
                            href="/"
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                            style={{ background: '#2A2A2A', color: '#C9A84C' }}
                        >
                            Dashboard
                        </Link>
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-6 py-8">
                {children}
            </main>
        </div>
    )
}
