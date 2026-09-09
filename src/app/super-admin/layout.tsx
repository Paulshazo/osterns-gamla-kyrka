import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

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

    if (profile?.role !== 'superadmin') redirect('/')

    return (
        <div className="min-h-screen" style={{ background: '#F7F3EC' }}>
            {/* Top bar */}
            <header className="sticky top-0 z-40 border-b" style={{ background: '#1A1A1A', borderColor: '#2E2E2E' }}>
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #8B6914 100%)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-sm font-bold" style={{ color: '#F0EBE0' }}>Super Admin Panel</h1>
                            <p className="text-xs" style={{ color: '#8A8178' }}>Global organisationshantering</p>
                        </div>
                    </div>
                    <a
                        href="/"
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                        style={{ background: '#2A2A2A', color: '#C9A84C' }}
                    >
                        Tillbaka till Dashboard
                    </a>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-6 py-8">
                {children}
            </main>
        </div>
    )
}
