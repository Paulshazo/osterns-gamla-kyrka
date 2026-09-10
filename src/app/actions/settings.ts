"use server"

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logAuditAction } from './audit'
import { getActiveOrgId } from './org'
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
                } catch { /* ignore in Server Actions */ }
            },
        },
    })
}

async function assertCanManageSettings() {
    const supabase = await getAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Ej inloggad')

    const orgId = await getActiveOrgId()
    if (!orgId) throw new Error('Välj en organisation innan du sparar inställningar.')

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role === 'superadmin' || profile?.role === 'admin') {
        return { supabase, orgId }
    }

    const { data: membership } = await supabase
        .from('organisation_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .maybeSingle()

    if (membership?.role !== 'admin') {
        throw new Error('Du måste vara admin för att ändra inställningar.')
    }

    return { supabase, orgId }
}

export async function saveAppSettingsAction(input: {
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
        const { supabase, orgId } = await assertCanManageSettings()

        const payload = {
            organisation_id: orgId,
            admin_title: input.admin_title,
            admin_logo_url: input.admin_logo_url || null,
            admin_logo_size: input.admin_logo_size,
            login_title: input.login_title,
            login_subtitle: input.login_subtitle,
            login_logo_url: input.login_logo_url || null,
            login_logo_size: input.login_logo_size,
            resend_api_key: input.resend_api_key || null,
            resend_from_email: input.resend_from_email || null,
            resend_from_name: input.resend_from_name || 'Kyrkoregistret',
            updated_at: new Date().toISOString(),
        }

        const { data: updated, error: updateError } = await supabase
            .from('app_settings')
            .update(payload)
            .eq('organisation_id', orgId)
            .select('id')

        if (updateError) throw updateError

        if (!updated || updated.length === 0) {
            const { error: insertError } = await supabase
                .from('app_settings')
                .insert(payload)
            if (insertError) throw insertError
        }

        await logAuditAction('settings', 'settings', orgId, {
            admin_title: input.admin_title,
            resend_from_email: input.resend_from_email || null,
        })

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message ?? 'Kunde inte spara inställningar.' }
    }
}
