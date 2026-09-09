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

        if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            return NextResponse.redirect(url)
        }

        // --- RBAC / Route Protection Logic ---
        if (user && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
            // Fetch the user's role and permissions
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role, permissions')
                .eq('id', user.id)
                .single()

            if (profile) {
                const { role, permissions } = profile

                // Map paths to permission keys
                const routePermissionMap: Record<string, string> = {
                    '/register': 'register',
                    '/betalningar': 'payments',
                    '/utgifter': 'expenses',
                    '/intakter': 'income',
                    '/statistik': 'stats',
                    '/installningar': 'settings',
                    '/anvandare': 'users'
                }

                // Superadmins and admins can access anything
                if (role !== 'superadmin' && role !== 'admin') {
                    // Check if current path requires a specific permission
                    for (const [route, perm] of Object.entries(routePermissionMap)) {
                        if (pathname.startsWith(route)) {
                            // If user is accessing a protected route, do they have the permission?
                            // Admins automatically get access to everything except maybe 'users', 
                            // but let's strictly require the explicit permission array for simplicity,
                            // OR let admins bypass? Let's strictly rely on the permissions array for regular access,
                            // except 'users' and 'installningar' which should be admin-only anyway.

                            // If they don't have the explicit permission, block them
                            if (!permissions || !Array.isArray(permissions) || !permissions.includes(perm)) {
                                // Redirect to dashboard / home as a fallback
                                const url = request.nextUrl.clone()
                                url.pathname = '/'
                                return NextResponse.redirect(url)
                            }
                        }
                    }

                    // Strict block for admin-only routes just in case the UI checkbox was ticked somehow
                    if ((pathname.startsWith('/installningar') || pathname.startsWith('/anvandare')) && role === 'user') {
                        const url = request.nextUrl.clone()
                        url.pathname = '/'
                        return NextResponse.redirect(url)
                    }
                }
            }
        }
    } catch (e) {
        // If something fails in auth, return the basic response instead of crashing with 500
        console.error('Middleware auth error:', e)
    }

    return supabaseResponse
}
