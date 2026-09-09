"use server"

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logAuditAction } from './audit'
import { supabaseAnonKey, supabaseUrl } from '@/utils/supabase/config'

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

async function verifySuperAdmin() {
    const supabase = await getAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Ej inloggad")
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    if (profile?.role !== 'superadmin') throw new Error("Endast superadmins")
    return { user, supabase }
}

// ── Active org cookie ──

export async function setActiveOrganisation(orgId: string) {
    const cookieStore = await cookies()
    const supabase = await getAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Ej inloggad")

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'superadmin') {
        const { data } = await supabase
            .from('organisation_members')
            .select('id')
            .eq('user_id', user.id)
            .eq('organisation_id', orgId)
            .single()
        if (!data) throw new Error("Inte behörig till den organisationen")
    }

    cookieStore.set('active_org_id', orgId, {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/'
    })
    return { success: true }
}

export async function getActiveOrgId(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get('active_org_id')?.value ?? null
}

// ── Org CRUD ──

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

        await supabase.from('app_settings').insert({
            organisation_id: org.id,
            admin_title: name,
            login_title: 'Välkommen',
            login_subtitle: `Logga in på ${name}`,
        })

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

// ── Orgs with member count (service role for accurate count) ──

export async function getOrgsWithMemberCount() {
    try {
        const { supabase } = await verifySuperAdmin()
        const { data: orgs } = await supabase
            .from('organisations')
            .select('*')
            .order('created_at', { ascending: false })

        if (!orgs) return []

        const orgsWithCount = await Promise.all(
            orgs.map(async (org) => {
                const { count } = await supabase
                    .from('organisation_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('organisation_id', org.id)
                return {
                    ...org,
                    organisation_members: [{ count: count ?? 0 }],
                }
            })
        )
        return orgsWithCount
    } catch {
        return []
    }
}

// ── Org members ──

export async function getOrgMembers(orgId: string) {
    const { supabase } = await verifySuperAdmin()
    const { data } = await supabase
        .from('organisation_members')
        .select('*, user_profiles(email, role)')
        .eq('organisation_id', orgId)
        .order('created_at')
    return data ?? []
}

export async function addOrgMember(orgId: string, userId: string, role: string, permissions: string[]) {
    try {
        const { supabase } = await verifySuperAdmin()
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

// ── Get all users (for adding to orgs) ──

export async function getAllUsers() {
    try {
        const { supabase } = await verifySuperAdmin()
        const { data } = await supabase
            .from('user_profiles')
            .select('id, email, role, permissions')
            .order('email')
        return data ?? []
    } catch {
        return []
    }
}
