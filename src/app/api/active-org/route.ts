import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
    const cookieStore = await cookies()
    const orgId = cookieStore.get('active_org_id')?.value ?? null
    return NextResponse.json({ orgId })
}
