"use client"

import { useState } from "react"
import { Building2, Shield, Loader2, ArrowLeft } from "lucide-react"
import { setActiveOrganisation } from "@/app/actions/org"

interface OrgOption {
    id: string
    name: string
    slug: string
    logo_url?: string | null
    primary_color?: string
    member_role: string
    member_permissions?: string[]
}

export default function OrgSelector({
    organisations,
    onBack,
    isSuperAdmin,
}: {
    organisations: OrgOption[]
    onBack: () => void
    isSuperAdmin: boolean
}) {
    const [loading, setLoading] = useState<string | null>(null)

    const handleSelectOrg = async (orgId: string) => {
        setLoading(orgId)
        try {
            await setActiveOrganisation(orgId)
            window.location.href = "/register"
        } catch (err: any) {
            console.error("Org selection error:", err)
            setLoading(null)
        }
    }

    const roleLabel = (role: string) => {
        switch (role) {
            case 'superadmin': return 'Super Admin'
            case 'admin': return 'Admin'
            default: return 'Användare'
        }
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #C9A84C 0%, #8B6914 100%)' }}>
                    <Building2 size={24} color="white" />
                </div>
                <h2 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>
                    Välj organisation
                </h2>
                <p className="text-sm mt-1" style={{ color: '#6B6355' }}>
                    Du tillhör flera organisationer. Välj vilken du vill öppna.
                </p>
            </div>

            {/* Org cards */}
            <div className="space-y-2.5">
                {organisations.map((org) => (
                    <button
                        key={org.id}
                        onClick={() => handleSelectOrg(org.id)}
                        disabled={loading !== null}
                        className="w-full text-left p-4 rounded-[12px] border transition-all hover:shadow-md disabled:opacity-60"
                        style={{
                            borderColor: loading === org.id ? '#C9A84C' : '#E5E0D8',
                            background: loading === org.id ? '#FFFBF0' : 'white',
                        }}
                        onMouseEnter={(e) => {
                            if (loading === null) {
                                e.currentTarget.style.borderColor = '#C9A84C'
                                e.currentTarget.style.background = '#FFFBF0'
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (loading !== org.id) {
                                e.currentTarget.style.borderColor = '#E5E0D8'
                                e.currentTarget.style.background = 'white'
                            }
                        }}
                    >
                        <div className="flex items-center gap-3">
                            {/* Logo or initials */}
                            {org.logo_url ? (
                                <img
                                    src={org.logo_url}
                                    alt={org.name}
                                    className="w-10 h-10 rounded-xl object-contain"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                                    style={{ background: org.primary_color || '#C9A84C' }}>
                                    {org.name.substring(0, 2).toUpperCase()}
                                </div>
                            )}

                            {/* Name & role */}
                            <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate" style={{ color: '#1A1A1A' }}>
                                    {org.name}
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: '#8A8178' }}>
                                    {roleLabel(org.member_role)}
                                </div>
                            </div>

                            {/* Loading spinner or arrow */}
                            {loading === org.id ? (
                                <Loader2 size={16} className="animate-spin" style={{ color: '#C9A84C' }} />
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8AFA0" strokeWidth="2">
                                    <path d="M9 18l6-6-6-6" />
                                </svg>
                            )}
                        </div>
                    </button>
                ))}
            </div>

            {/* Super Admin Panel button */}
            {isSuperAdmin && (
                <button
                    onClick={() => { window.location.href = "/super-admin" }}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-[10px] text-sm font-semibold transition-all"
                    style={{ background: '#1A1A1A', color: '#C9A84C' }}
                >
                    <Shield size={16} />
                    Super Admin Panel
                </button>
            )}

            {/* Back */}
            <button
                onClick={onBack}
                className="w-full flex items-center justify-center gap-2 text-sm py-2 transition-colors"
                style={{ color: '#8A8178' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#1A1A1A')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#8A8178')}
            >
                <ArrowLeft size={14} />
                Tillbaka till inloggning
            </button>
        </div>
    )
}
