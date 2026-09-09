"use server"

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logAuditAction } from './audit'
import { supabaseAnonKey, supabaseUrl } from '@/utils/supabase/config'

function getServiceRoleClient() {
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseServiceKey) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY saknas i miljövariabler. ' +
            'Hämta den från: Supabase Dashboard → Settings → API → service_role (secret). ' +
            'På Vercel: Project → Settings → Environment Variables. Lokalt: .env.local.'
        )
    }

    return createSupabaseClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}

function tryServiceRoleClient() {
    try {
        return getServiceRoleClient()
    } catch {
        return null
    }
}

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

async function verifyAdminAccess() {
    const supabase = await getAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        throw new Error("Obehörig tillgång")
    }

    const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || !profile) {
        throw new Error("Otillräckliga rättigheter")
    }

    if (profile.role === 'superadmin' || profile.role === 'admin') {
        return { user, role: profile.role as 'superadmin' | 'admin' }
    }

    const orgId = await getActiveOrgId()
    if (orgId) {
        const { data: membership } = await supabase
            .from('organisation_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('organisation_id', orgId)
            .eq('is_active', true)
            .maybeSingle()

        if (membership?.role === 'admin') {
            return { user, role: 'admin' as const }
        }
    }

    throw new Error("Otillräckliga rättigheter")
}

async function assertUserInActiveOrg(userId: string) {
    const orgId = await getActiveOrgId()
    if (!orgId) throw new Error("Ingen organisation vald")

    let queryClient = await getAuthClient()
    try {
        queryClient = getServiceRoleClient()
    } catch { /* fall back to the signed-in client */ }

    const { data } = await queryClient
        .from('organisation_members')
        .select('id')
        .eq('user_id', userId)
        .eq('organisation_id', orgId)
        .maybeSingle()

    if (!data) throw new Error("Användaren tillhör inte denna organisation")
    return orgId
}

async function getActiveOrgId(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get('active_org_id')?.value ?? null
}

export async function createUserAction(formData: FormData) {
    try {
        const { role: currentUserRole } = await verifyAdminAccess()

        const email = formData.get('email') as string
        const password = formData.get('password') as string
        const role = formData.get('role') as string
        const rawPermissions = formData.getAll('permissions')

        if (role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan skapa andra superadmins.")
        }

        const activeOrgId = await getActiveOrgId()
        if (!activeOrgId) {
            throw new Error("Välj en organisation innan du skapar användare.")
        }

        const permissionsArray = rawPermissions.map(p => p.toString())
        const memberRole = role === 'superadmin' ? 'admin' : role
        const supabaseAdmin = tryServiceRoleClient()
        let newUserId: string

        if (supabaseAdmin) {
            const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: email,
                password: password,
                email_confirm: true
            })

            if (createError) throw createError
            if (!authData.user) throw new Error("Kunde inte skapa användare.")
            newUserId = authData.user.id

            const { error: updateError } = await supabaseAdmin
                .from('user_profiles')
                .update({
                    role: role,
                    permissions: permissionsArray,
                    updated_at: new Date().toISOString()
                })
                .eq('id', newUserId)

            if (updateError) throw updateError

            await supabaseAdmin
                .from('organisation_members')
                .upsert({
                    organisation_id: activeOrgId,
                    user_id: newUserId,
                    role: memberRole,
                    permissions: permissionsArray,
                    is_active: true,
                }, { onConflict: 'organisation_id,user_id' })
        } else {
            const detached = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
                auth: { autoRefreshToken: false, persistSession: false }
            })
            const { data: signUpData, error: signUpError } = await detached.auth.signUp({
                email,
                password,
            })
            if (signUpError) throw signUpError
            if (!signUpData.user) throw new Error("Kunde inte skapa användare.")
            newUserId = signUpData.user.id

            const supabase = await getAuthClient()
            const { error: memberError } = await supabase
                .from('organisation_members')
                .upsert({
                    organisation_id: activeOrgId,
                    user_id: newUserId,
                    role: memberRole,
                    permissions: permissionsArray,
                    is_active: true,
                }, { onConflict: 'organisation_id,user_id' })
            if (memberError) throw memberError

            let profileError: { message: string } | null = null
            for (let i = 0; i < 5; i++) {
                const { error } = await supabase
                    .from('user_profiles')
                    .update({
                        role: role,
                        permissions: permissionsArray,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', newUserId)
                profileError = error
                if (!error) break
                await new Promise(resolve => setTimeout(resolve, 250))
            }
            if (profileError) throw profileError
        }

        await logAuditAction('create', 'user', newUserId, { email, role, organisation_id: activeOrgId })

        return { success: true, message: 'Användare skapad framgångsrikt!' }
    } catch (error: any) {
        console.error("Error creating user:", error)
        return { success: false, error: error.message || "Ett fel uppstod vid skapandet av användaren." }
    }
}

export async function updateUserRoleAndPermissions(userId: string, role: string, permissions: string[]) {
    try {
        const { role: currentUserRole } = await verifyAdminAccess()

        const supabase = await getAuthClient()

        const { data: targetUser } = await supabase.from('user_profiles').select('role').eq('id', userId).single()

        if (targetUser?.role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan ändra rättigheter för andra superadmins.")
        }

        if (role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan tilldela superadmin-rollen.")
        }

        if (currentUserRole !== 'superadmin') {
            await assertUserInActiveOrg(userId)
        }

        const { error } = await supabase
            .from('user_profiles')
            .update({
                role: role,
                permissions: permissions,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)

        if (error) throw error

        const activeOrgId = await getActiveOrgId()
        if (activeOrgId) {
            const memberClient = tryServiceRoleClient() ?? supabase
            const { error: memberError } = await memberClient
                .from('organisation_members')
                .update({
                    role: role === 'superadmin' ? 'admin' : role,
                    permissions: permissions,
                })
                .eq('user_id', userId)
                .eq('organisation_id', activeOrgId)
            if (memberError) throw memberError
        }

        return { success: true }
    } catch (error: any) {
        console.error("Error updating user:", error)
        return { success: false, error: error.message }
    }
}

export async function deleteUserAction(userId: string) {
    try {
        const { role: currentUserRole, user: currentUser } = await verifyAdminAccess()

        if (userId === currentUser.id) {
            throw new Error("Du kan inte radera ditt eget konto.")
        }

        if (currentUserRole !== 'superadmin') {
            await assertUserInActiveOrg(userId)
        }

        const supabaseAdmin = tryServiceRoleClient()
        const orgId = await getActiveOrgId()
        const authClient = await getAuthClient()

        const { data: targetUser } = await (supabaseAdmin ?? authClient)
            .from('user_profiles')
            .select('role')
            .eq('id', userId)
            .single()

        if (targetUser?.role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan radera en annan superadmin.")
        }

        if (supabaseAdmin) {
            const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
            if (error) throw error
        } else if (orgId) {
            const { error } = await authClient
                .from('organisation_members')
                .delete()
                .eq('user_id', userId)
                .eq('organisation_id', orgId)
            if (error) throw error
        } else {
            throw new Error("Ingen organisation vald")
        }

        await logAuditAction('delete', 'user', userId, { role: targetUser?.role ?? 'unknown' })

        return { success: true }
    } catch (error: any) {
        console.error("Error deleting user:", error)
        return { success: false, error: error.message }
    }
}

export async function listOrganisationUsers() {
    try {
        const { user } = await verifyAdminAccess()
        const orgId = await getActiveOrgId()
        if (!orgId) {
            return { success: false as const, users: [], error: 'Ingen organisation vald' }
        }

        const supabase = await getAuthClient()

        await supabase.from('organisation_members').upsert({
            organisation_id: orgId,
            user_id: user.id,
            role: 'admin',
            is_active: true,
        }, { onConflict: 'organisation_id,user_id', ignoreDuplicates: true })

        const { data: members, error: memberError } = await supabase
            .from('organisation_members')
            .select('user_id, role, permissions, created_at')
            .eq('organisation_id', orgId)
            .order('created_at', { ascending: false })

        if (memberError) throw memberError

        const ids = [...new Set((members ?? []).map(m => m.user_id).filter(Boolean))]
        if (!ids.includes(user.id)) ids.push(user.id)

        const { data: profiles, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, email, role, permissions, created_at')
            .in('id', ids)

        if (profileError) throw profileError

        const profileById = new Map((profiles ?? []).map(p => [p.id, p]))
        const users = (members ?? []).flatMap((row) => {
            const profile = profileById.get(row.user_id)
            if (!profile) return []
            const role = profile.role === 'superadmin'
                ? 'superadmin'
                : (row.role === 'admin' ? 'admin' : 'user')
            const permissions = Array.isArray(row.permissions)
                ? row.permissions
                : (Array.isArray(profile.permissions) ? profile.permissions : [])
            return [{
                id: profile.id as string,
                email: profile.email as string,
                role: role as 'superadmin' | 'admin' | 'user',
                permissions: permissions as string[],
                created_at: profile.created_at as string,
            }]
        })

        if (!users.some(u => u.id === user.id)) {
            const me = profileById.get(user.id)
            if (me) {
                users.unshift({
                    id: me.id,
                    email: me.email,
                    role: (me.role === 'superadmin' || me.role === 'admin' || me.role === 'user') ? me.role : 'user',
                    permissions: Array.isArray(me.permissions) ? me.permissions : [],
                    created_at: me.created_at,
                })
            }
        }

        return { success: true as const, users }
    } catch (error: any) {
        return { success: false as const, users: [], error: error.message }
    }
}
