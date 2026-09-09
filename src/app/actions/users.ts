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
            'Lägg sedan till den i din .env.local-fil: SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...'
        )
    }

    return createSupabaseClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
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

    if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
        throw new Error("Otillräckliga rättigheter")
    }

    return { user, role: profile.role }
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

        const supabaseAdmin = getServiceRoleClient()

        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        })

        if (createError) throw createError
        if (!authData.user) throw new Error("Kunde inte skapa användare.")

        const permissionsArray = rawPermissions.map(p => p.toString())

        const { error: updateError } = await supabaseAdmin
            .from('user_profiles')
            .update({
                role: role,
                permissions: permissionsArray,
                updated_at: new Date().toISOString()
            })
            .eq('id', authData.user.id)

        if (updateError) throw updateError

        // Add user to current organisation
        const activeOrgId = await getActiveOrgId()
        if (activeOrgId) {
            await supabaseAdmin
                .from('organisation_members')
                .upsert({
                    organisation_id: activeOrgId,
                    user_id: authData.user.id,
                    role: role,
                    permissions: permissionsArray,
                    is_active: true,
                }, { onConflict: 'organisation_id,user_id' })
        }

        await logAuditAction('create', 'user', authData.user.id, { email, role, organisation_id: activeOrgId })

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

        const { error } = await supabase
            .from('user_profiles')
            .update({
                role: role,
                permissions: permissions,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)

        if (error) throw error

        // Also update organisation_members role/permissions
        const activeOrgId = await getActiveOrgId()
        if (activeOrgId) {
            const supabaseAdmin = getServiceRoleClient()
            await supabaseAdmin
                .from('organisation_members')
                .update({
                    role: role,
                    permissions: permissions,
                })
                .eq('user_id', userId)
                .eq('organisation_id', activeOrgId)
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

        const supabaseAdmin = getServiceRoleClient()

        const { data: targetUser } = await supabaseAdmin.from('user_profiles').select('role').eq('id', userId).single()

        if (targetUser?.role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan radera en annan superadmin.")
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (error) throw error

        await logAuditAction('delete', 'user', userId, { role: targetUser?.role ?? 'unknown' })

        return { success: true }
    } catch (error: any) {
        console.error("Error deleting user:", error)
        return { success: false, error: error.message }
    }
}
