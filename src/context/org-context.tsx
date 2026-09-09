"use client"

import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react"
import { createClient } from "@/utils/supabase/client"
import type { Department, ProfileRole } from "@/lib/permissions"

interface OrgContextValue {
    activeOrgId: string | null
    activeOrgName: string | null
    activeOrgLogo: string | null
    activeOrgColor: string
    profileRole: ProfileRole
    orgRole: string | null
    permissions: string[]
    isSuperAdmin: boolean
    isOrgAdmin: boolean
    canManageUsers: boolean
    canSwitchOrg: boolean
    canExport: boolean
    canEdit: (section: Department) => boolean
    loading: boolean
    refreshOrg: () => Promise<void>
}

const defaultContext: OrgContextValue = {
    activeOrgId: null,
    activeOrgName: null,
    activeOrgLogo: null,
    activeOrgColor: '#C9A84C',
    profileRole: 'user',
    orgRole: null,
    permissions: [],
    isSuperAdmin: false,
    isOrgAdmin: false,
    canManageUsers: false,
    canSwitchOrg: false,
    canExport: false,
    canEdit: () => false,
    loading: true,
    refreshOrg: async () => {},
}

const OrgContext = createContext<OrgContextValue>(defaultContext)

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    return match ? decodeURIComponent(match[2]) : null
}

export function OrgProvider({ children }: { children: ReactNode }) {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])

    const [activeOrgId, setActiveOrgId] = useState<string | null>(null)
    const [activeOrgName, setActiveOrgName] = useState<string | null>(null)
    const [activeOrgLogo, setActiveOrgLogo] = useState<string | null>(null)
    const [activeOrgColor, setActiveOrgColor] = useState('#C9A84C')
    const [profileRole, setProfileRole] = useState<ProfileRole>('user')
    const [orgRole, setOrgRole] = useState<string | null>(null)
    const [permissions, setPermissions] = useState<string[]>([])
    const [membershipCount, setMembershipCount] = useState(0)
    const [loading, setLoading] = useState(true)

    const fetchOrg = useCallback(async () => {
        if (!supabase) { setLoading(false); return }
        try {
            let orgId: string | null = getCookie('active_org_id')

            if (!orgId) {
                try {
                    const res = await fetch('/api/active-org')
                    if (res.ok) {
                        const data = await res.json()
                        orgId = data.orgId
                    }
                } catch { /* ignore */ }
            }

            const { data: { user } } = await supabase.auth.getUser()
            let nextProfileRole: ProfileRole = 'user'
            let nextOrgRole: string | null = null
            let nextPermissions: string[] = []
            let nextCount = 0

            if (user) {
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('role, permissions')
                    .eq('id', user.id)
                    .single()

                if (profile?.role === 'superadmin' || profile?.role === 'admin' || profile?.role === 'user') {
                    nextProfileRole = profile.role
                }
                nextPermissions = Array.isArray(profile?.permissions) ? profile.permissions : []

                const { data: memberships } = await supabase
                    .from('organisation_members')
                    .select('organisation_id, role, permissions')
                    .eq('user_id', user.id)
                    .eq('is_active', true)

                nextCount = memberships?.length ?? 0

                if (orgId && memberships) {
                    const mine = memberships.find(m => m.organisation_id === orgId)
                    if (mine) {
                        nextOrgRole = mine.role
                        if (Array.isArray(mine.permissions) && mine.permissions.length > 0) {
                            nextPermissions = mine.permissions
                        }
                    }
                }
            }

            setProfileRole(nextProfileRole)
            setOrgRole(nextOrgRole)
            setPermissions(nextPermissions)
            setMembershipCount(nextCount)

            if (orgId) {
                setActiveOrgId(orgId)
                const { data } = await supabase
                    .from('organisations')
                    .select('name, logo_url, primary_color')
                    .eq('id', orgId)
                    .single()
                if (data) {
                    setActiveOrgName(data.name)
                    setActiveOrgLogo(data.logo_url)
                    setActiveOrgColor(data.primary_color || '#C9A84C')
                }
            } else {
                setActiveOrgId(null)
                setActiveOrgName(null)
                setActiveOrgLogo(null)
            }
        } catch { /* ignore */ }
        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchOrg() }, [fetchOrg])

    const isSuperAdmin = profileRole === 'superadmin'
    const isOrgAdmin = isSuperAdmin || orgRole === 'admin' || profileRole === 'admin'
    const canManageUsers = isOrgAdmin
    const canExport = isOrgAdmin
    const canSwitchOrg = isSuperAdmin || membershipCount > 1

    const canEdit = useCallback((section: Department) => {
        if (loading) return false
        if (isOrgAdmin) return true
        return permissions.includes(section)
    }, [loading, isOrgAdmin, permissions])

    return (
        <OrgContext.Provider value={{
            activeOrgId,
            activeOrgName,
            activeOrgLogo,
            activeOrgColor,
            profileRole,
            orgRole,
            permissions,
            isSuperAdmin,
            isOrgAdmin,
            canManageUsers,
            canSwitchOrg,
            canExport,
            canEdit,
            loading,
            refreshOrg: fetchOrg,
        }}>
            {children}
        </OrgContext.Provider>
    )
}

export function useActiveOrg() {
    return useContext(OrgContext)
}
