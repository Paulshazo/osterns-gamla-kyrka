"use server"

import { createClient } from "@/utils/supabase/server"
import { logAuditAction } from './audit'
import { getActiveOrgId } from './org'

async function resolveOrgId(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    clientOrgId?: string | null,
) {
    if (clientOrgId) return clientOrgId
    const fromCookie = await getActiveOrgId()
    if (fromCookie) return fromCookie

    const { data: memberships } = await supabase
        .from('organisation_members')
        .select('organisation_id, role')
        .eq('user_id', userId)
        .eq('is_active', true)

    if (!memberships?.length) return null
    const admin = memberships.find(m => m.role === 'admin')
    return admin?.organisation_id ?? memberships[0].organisation_id
}

async function assertSuperAdmin(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
) {
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .single()

    if (profile?.role !== 'superadmin') {
        throw new Error('Endast superadmin kan ändra systeminställningar.')
    }
}

export async function saveAppSettingsAction(input: {
    organisationId?: string | null
    admin_title: string
    admin_logo_url: string
    admin_logo_size: number
    login_title: string
    login_subtitle: string
    login_logo_url: string
    login_logo_size: number
    resend_api_key: string
    resend_from_email: string
    resend_from_name: string
}) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Ej inloggad')

        const orgId = await resolveOrgId(supabase, user.id, input.organisationId)
        if (!orgId) throw new Error('Välj en organisation innan du sparar inställningar.')

        await assertSuperAdmin(supabase, user.id)

        const fields = {
            organisation_id: orgId,
            admin_title: input.admin_title,
            admin_logo_url: input.admin_logo_url || null,
            admin_logo_size: input.admin_logo_size,
            login_title: input.login_title,
            login_subtitle: input.login_subtitle,
            login_logo_url: input.login_logo_url || null,
            login_logo_size: input.login_logo_size,
            resend_api_key: input.resend_api_key.trim() || null,
            resend_from_email: input.resend_from_email.trim() || null,
            resend_from_name: input.resend_from_name.trim() || 'Kyrkoregistret',
            updated_at: new Date().toISOString(),
        }

        const { data: byOrg, error: byOrgError } = await supabase
            .from('app_settings')
            .update(fields)
            .eq('organisation_id', orgId)
            .select('id')
        if (byOrgError) throw byOrgError
        if (byOrg?.length) {
            await logAuditAction('settings', 'settings', orgId, {
                admin_title: input.admin_title,
                resend_from_email: fields.resend_from_email,
            })
            return { success: true, organisationId: orgId }
        }

        const { data: byId, error: byIdError } = await supabase
            .from('app_settings')
            .update(fields)
            .eq('id', 1)
            .select('id')
        if (byIdError) throw byIdError
        if (byId?.length) {
            await logAuditAction('settings', 'settings', orgId, {
                admin_title: input.admin_title,
                resend_from_email: fields.resend_from_email,
            })
            return { success: true, organisationId: orgId }
        }

        const { error: insertError } = await supabase
            .from('app_settings')
            .insert(fields)
        if (insertError) throw insertError

        await logAuditAction('settings', 'settings', orgId, {
            admin_title: input.admin_title,
            resend_from_email: fields.resend_from_email,
        })
        return { success: true, organisationId: orgId }
    } catch (error: any) {
        return { success: false, error: error.message ?? 'Kunde inte spara inställningar.' }
    }
}

export async function changePasswordAction(input: {
    currentPassword: string
    newPassword: string
    confirmPassword: string
}) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) throw new Error('Ej inloggad')

        const currentPassword = input.currentPassword
        const newPassword = input.newPassword
        const confirmPassword = input.confirmPassword

        if (!currentPassword || !newPassword || !confirmPassword) {
            throw new Error('Fyll i alla lösenordsfält.')
        }
        if (newPassword.length < 8) {
            throw new Error('Det nya lösenordet måste vara minst 8 tecken.')
        }
        if (newPassword !== confirmPassword) {
            throw new Error('Det nya lösenordet och upprepningen matchar inte.')
        }
        if (newPassword === currentPassword) {
            throw new Error('Det nya lösenordet måste skilja sig från det nuvarande.')
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
        })
        if (signInError) {
            throw new Error('Felaktigt nuvarande lösenord.')
        }

        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword,
        })
        if (updateError) throw updateError

        await logAuditAction('password_changed', 'auth', user.id, {})
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message ?? 'Kunde inte byta lösenord.' }
    }
}
