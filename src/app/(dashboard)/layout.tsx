import { Sidebar, MobileSidebar } from "@/components/sidebar"
import { LanguageProvider } from "@/components/language-provider"
import { OrgProvider } from "@/context/org-context"

export const dynamic = 'force-dynamic'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <LanguageProvider>
            <OrgProvider>
                <div className="flex h-screen bg-background overflow-hidden">
                    {/* Desktop sidebar */}
                    <aside className="w-64 flex-shrink-0 hidden md:block">
                        <Sidebar />
                    </aside>

                    {/* Mobile sidebar (hamburger + drawer) */}
                    <MobileSidebar />

                    {/* Main content — pt-20 on mobile clears the hamburger button */}
                    <main className="flex-1 overflow-y-auto overflow-x-hidden">
                        <div className="px-4 pt-20 pb-6 md:px-10 md:pt-8 md:pb-8 max-w-7xl mx-auto">
                            {children}
                        </div>
                    </main>
                </div>
            </OrgProvider>
        </LanguageProvider>
    )
}
