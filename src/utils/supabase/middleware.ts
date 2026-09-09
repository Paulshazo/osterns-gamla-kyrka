import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAnonKey, supabaseUrl } from './config'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    try {
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        })

        const {
            data: { user },
        } = await supabase.auth.getUser()

        const pathname = request.nextUrl.pathname

        // Unauthenticated → login
        if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/login'
            return NextResponse.redirect(redirectUrl)
        }

        // Set active org context from cookie for Supabase RLS
        const activeOrgId = request.cookies.get('active_org_id')?.value
        if (activeOrgId && user) {
            try {
                await supabase.rpc('set_current_org', { org_id: activeOrgId })
            } catch { /* ignore if RPC not yet created */ }
        }

        // RBAC for authenticated users
        if (user && !pathname.startsWith('/login') && !pathname.startsWith('/auth') && !pathname.startsWith('/api')) {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role, permissions')
                .eq('id', user.id)
                .single()

            if (profile) {
                const { role, permissions } = profile

                // /super-admin — only superadmins
                if (pathname.startsWith('/super-admin')) {
                    if (role !== 'superadmin') {
                        const redirectUrl = request.nextUrl.clone()
                        redirectUrl.pathname = '/'
                        return NextResponse.redirect(redirectUrl)
                    }
                    // Superadmin on /super-admin — always allow, no org needed
                    return supabaseResponse
                }

                // Route permission map
                const routePermissionMap: Record<string, string> = {
                    '/register': 'register',
                    '/betalningar': 'payments',
                    '/utgifter': 'expenses',
                    '/intakter': 'income',
                    '/statistik': 'stats',
                    '/installningar': 'settings',
                    '/anvandare': 'users'
                }

                // Regular users need explicit permissions
                if (role !== 'superadmin' && role !== 'admin') {
                    for (const [route, perm] of Object.entries(routePermissionMap)) {
                        if (pathname.startsWith(route)) {
                            if (!permissions || !Array.isArray(permissions) || !permissions.includes(perm)) {
                                const redirectUrl = request.nextUrl.clone()
                                redirectUrl.pathname = '/'
                                return NextResponse.redirect(redirectUrl)
                            }
                        }
                    }

                    if ((pathname.startsWith('/installningar') || pathname.startsWith('/anvandare')) && role === 'user') {
                        const redirectUrl = request.nextUrl.clone()
                        redirectUrl.pathname = '/'
                        return NextResponse.redirect(redirectUrl)
                    }

                    // Non-superadmin without active org → send to login for org selection
                    if (!activeOrgId) {
                        const redirectUrl = request.nextUrl.clone()
                        redirectUrl.pathname = '/login'
                        return NextResponse.redirect(redirectUrl)
                    }
                }
            }
        }
    } catch (e) {
        console.error('Middleware auth error:', e)
    }

    return supabaseResponse
}
