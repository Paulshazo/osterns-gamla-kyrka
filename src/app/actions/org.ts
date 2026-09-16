"use server"

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logAuditAction } from './audit'
import { supabaseAnonKey, supabaseUrl } from '@/utils/supabase/config'
import { isPlatformRole, isSuperAdminRole, type ProfileRole } from '@/lib/permissions'

async function getAuthClient() {
    const cookieStore = await cookies()
    return createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() { return cookieStore.getAll() },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        cookieStore.set(name, value, options)
                    )
                } catch { }
            },
        },
    })
}

async function getProfileRole(userId: string, supabase: Awaited<ReturnType<typeof getAuthClient>>) {
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .single()
    return (profile?.role ?? null) as ProfileRole | null
}

/** Full write access — superadmin only. */
async function verifySuperAdmin() {
    const supabase = await getAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Ej inloggad")
    const role = await getProfileRole(user.id, supabase)
    if (!isSuperAdminRole(role)) throw new Error("Endast superadmins")
    return { user, supabase, role: role as ProfileRole }
}

/** Read / monitor access — superadmin or superuser. */
async function verifyPlatformStaff() {
    const supabase = await getAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Ej inloggad")
    const role = await getProfileRole(user.id, supabase)
    if (!isPlatformRole(role)) throw new Error("Endast plattformsanvändare")
    return { user, supabase, role: role as ProfileRole }
}

export async function getMyPlatformRole() {
    try {
        const { role } = await verifyPlatformStaff()
        return { success: true as const, role }
    } catch (error: any) {
        return { success: false as const, role: null as ProfileRole | null, error: error.message }
    }
}

// ── Active org cookie ──

export async function setActiveOrganisation(orgId: string) {
    const cookieStore = await cookies()
    const supabase = await getAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Ej inloggad")

    const role = await getProfileRole(user.id, supabase)

    if (!isPlatformRole(role)) {
        const { data } = await supabase
            .from('organisation_members')
            .select('id')
            .eq('user_id', user.id)
            .eq('organisation_id', orgId)
            .single()
        if (!data) throw new Error("Inte behörig till den organisationen")
    }

    cookieStore.set('active_org_id', orgId, {
        httpOnly: false, secure: true, sameSite: 'lax', path: '/'
    })
    return { success: true }
}

export async function getActiveOrgId(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get('active_org_id')?.value ?? null
}

// ── Org CRUD (superadmin only) ──

export async function createOrganisation(formData: FormData) {
    try {
        const { user, supabase } = await verifySuperAdmin()
        const name = formData.get('name') as string
        const slug = formData.get('slug') as string
        const primaryColor = (formData.get('primary_color') as string) || '#C9A84C'
        if (!name || !slug) throw new Error("Namn och slug krävs")

        const { data: org, error } = await supabase
            .from('organisations')
            .insert({
                name,
                slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                primary_color: primaryColor,
                created_by: user.id,
            })
            .select()
            .single()
        if (error) throw error

        const { error: settingsError } = await supabase.from('app_settings').insert({
            organisation_id: org.id,
            admin_title: name,
            login_title: 'Välkommen',
            login_subtitle: `Logga in på ${name}`,
        })
        if (settingsError) throw settingsError

        // Platform accounts are not org members — they access all orgs via role.

        await logAuditAction('create', 'organisation', org.id, { name, slug })
        return { success: true, organisation: org }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function updateOrganisation(orgId: string, data: Record<string, any>) {
    try {
        const { supabase } = await verifySuperAdmin()
        const { error } = await supabase
            .from('organisations')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', orgId)
        if (error) throw error
        await logAuditAction('update', 'organisation', orgId, data)
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function deleteOrganisation(orgId: string) {
    try {
        const { supabase } = await verifySuperAdmin()

        await supabase.from('audit_logs').delete().eq('organisation_id', orgId)
        await supabase.from('betalningar').delete().eq('organisation_id', orgId)
        await supabase.from('barn').delete().eq('organisation_id', orgId)
        await supabase.from('familjer').delete().eq('organisation_id', orgId)
        await supabase.from('intakter').delete().eq('organisation_id', orgId)
        await supabase.from('utgifter').delete().eq('organisation_id', orgId)
        await supabase.from('app_settings').delete().eq('organisation_id', orgId)
        await supabase.from('organisation_members').delete().eq('organisation_id', orgId)

        const { error } = await supabase.from('organisations').delete().eq('id', orgId)
        if (error) throw error
        await logAuditAction('delete', 'organisation', orgId, {})
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// ── Orgs with member count ──

export async function getOrgsWithMemberCount() {
    try {
        const { supabase } = await verifyPlatformStaff()
        const { data: orgs } = await supabase
            .from('organisations')
            .select('*')
            .order('created_at', { ascending: false })

        if (!orgs) return []

        const orgsWithCount = await Promise.all(
            orgs.map(async (org) => {
                const { data: members } = await supabase
                    .from('organisation_members')
                    .select('user_id')
                    .eq('organisation_id', org.id)
                    .eq('is_active', true)

                const ids = [...new Set((members ?? []).map(m => m.user_id).filter(Boolean))]
                let count = 0
                if (ids.length) {
                    const { data: profiles } = await supabase
                        .from('user_profiles')
                        .select('id, role')
                        .in('id', ids)
                    count = (profiles ?? []).filter(p => !isPlatformRole(p.role)).length
                }

                return {
                    ...org,
                    organisation_members: [{ count }],
                }
            })
        )
        return orgsWithCount
    } catch {
        return []
    }
}

/** Distinct org users (excludes platform superadmin/superuser accounts). */
export async function getActiveUserCount() {
    try {
        const { supabase } = await verifyPlatformStaff()
        const { data, error } = await supabase
            .from('organisation_members')
            .select('user_id')
            .eq('is_active', true)

        if (error) throw error
        const ids = [...new Set((data ?? []).map(row => row.user_id).filter(Boolean))]
        if (!ids.length) return 0

        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, role')
            .in('id', ids)

        return (profiles ?? []).filter(p => !isPlatformRole(p.role)).length
    } catch {
        return 0
    }
}

// ── Org members (hide platform accounts) ──

export async function getOrgMembers(orgId: string) {
    const { supabase } = await verifyPlatformStaff()

    const { data: members, error: memberError } = await supabase
        .from('organisation_members')
        .select('id, user_id, role, permissions, is_active, created_at')
        .eq('organisation_id', orgId)
        .order('created_at')

    if (memberError) throw memberError
    if (!members?.length) return []

    const ids = [...new Set(members.map(m => m.user_id).filter(Boolean))]
    const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, email, role')
        .in('id', ids)

    if (profileError) throw profileError

    const profileById = new Map((profiles ?? []).map(p => [p.id, p]))
    return members.flatMap((m) => {
        const profile = profileById.get(m.user_id)
        if (profile && isPlatformRole(profile.role)) return []
        return [{
            ...m,
            permissions: Array.isArray(m.permissions) ? m.permissions : [],
            user_profiles: profile
                ? { email: profile.email as string, role: profile.role as string }
                : null,
        }]
    })
}

export async function addOrgMember(orgId: string, userId: string, role: string, permissions: string[]) {
    try {
        const { supabase } = await verifySuperAdmin()
        const profileRole = await getProfileRole(userId, supabase)
        if (isPlatformRole(profileRole)) {
            throw new Error("Superadmin/superanvändare tillhör inte organisationer.")
        }
        const { error } = await supabase
            .from('organisation_members')
            .upsert({
                organisation_id: orgId,
                user_id: userId,
                role,
                permissions,
                is_active: true,
            }, { onConflict: 'organisation_id,user_id' })
        if (error) throw error
        await logAuditAction('create', 'organisation_member', orgId, { userId, role })
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function removeOrgMember(orgId: string, userId: string) {
    try {
        const { supabase } = await verifySuperAdmin()
        const { error } = await supabase
            .from('organisation_members')
            .delete()
            .eq('organisation_id', orgId)
            .eq('user_id', userId)
        if (error) throw error
        await logAuditAction('delete', 'organisation_member', orgId, { userId })
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function updateOrgMemberRole(orgId: string, userId: string, role: string, permissions: string[]) {
    try {
        const { supabase } = await verifySuperAdmin()
        const { error } = await supabase
            .from('organisation_members')
            .update({ role, permissions })
            .eq('organisation_id', orgId)
            .eq('user_id', userId)
        if (error) throw error
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/** Org-eligible users only (excludes platform accounts). */
export async function getAllUsers() {
    try {
        const { supabase } = await verifySuperAdmin()
        const { data } = await supabase
            .from('user_profiles')
            .select('id, email, role, permissions')
            .order('email')
        return (data ?? []).filter(u => !isPlatformRole(u.role))
    } catch {
        return []
    }
}
