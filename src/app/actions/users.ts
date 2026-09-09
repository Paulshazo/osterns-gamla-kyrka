"use server"

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { logAuditAction } from './audit'
import { supabaseAnonKey, supabaseUrl } from '@/utils/supabase/config'

// We need a Service Role client to bypass RLS and create/delete users
// without logging out the current admin user.
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

// Helper to get the authenticated user client based on cookies
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

// Verify if the current user is an admin or superadmin
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

export async function createUserAction(formData: FormData) {
    try {
        const { role: currentUserRole } = await verifyAdminAccess()

        const email = formData.get('email') as string
        const password = formData.get('password') as string
        const role = formData.get('role') as string
        const rawPermissions = formData.getAll('permissions')

        // Only superadmins can create other superadmins
        if (role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan skapa andra superadmins.")
        }

        const supabaseAdmin = getServiceRoleClient()

        // 1. Create the user in auth.users
        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true // Auto-confirm the email
        })

        if (createError) throw createError

        if (!authData.user) throw new Error("Kunde inte skapa användare.")

        // 2. The database trigger `handle_new_user` will have created a default profile for them.
        // We now need to UPDATE that profile with the assigned role and permissions.
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

        await logAuditAction('create', 'user', authData.user.id, { email, role })

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

        // Verify we aren't trying to downgrade a superadmin without being a superadmin ourselves
        const { data: targetUser } = await supabase.from('user_profiles').select('role').eq('id', userId).single()

        if (targetUser?.role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan ändra rättigheter för andra superadmins.")
        }

        // Prevent admins from upgrading someone to superadmin
        if (role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan tilldela superadmin-rollen.")
        }

        // For simple updates we can just use the authenticated client since admins 
        // have UPDATE permissions on the user_profiles table via RLS policies
        const { error } = await supabase
            .from('user_profiles')
            .update({
                role: role,
                permissions: permissions,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)

        if (error) throw error

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

        // Verify target user's role
        const { data: targetUser } = await supabaseAdmin.from('user_profiles').select('role').eq('id', userId).single()

        if (targetUser?.role === 'superadmin' && currentUserRole !== 'superadmin') {
            throw new Error("Endast superadmins kan radera en annan superadmin.")
        }

        // Delete from auth.users (Cascade delete will remove the profile)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (error) throw error

        await logAuditAction('delete', 'user', userId, { role: targetUser?.role ?? 'unknown' })

        return { success: true }
    } catch (error: any) {
        console.error("Error deleting user:", error)
        return { success: false, error: error.message }
    }
}
