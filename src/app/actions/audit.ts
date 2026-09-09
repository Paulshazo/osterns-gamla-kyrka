"use server"

import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function logAuditAction(
    action: string,
    resource: string,
    resourceId: string = '',
    details: Record<string, unknown> = {}
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const cookieStore = await cookies()
        const activeOrgId = cookieStore.get('active_org_id')?.value || null

        await supabase.from('audit_logs').insert({
            user_id:         user.id,
            user_email:      user.email,
            action,
            resource,
            resource_id:     resourceId || null,
            details,
            organisation_id: activeOrgId,
        })
    } catch {
        // fire-and-forget — never block the UI
    }
}
