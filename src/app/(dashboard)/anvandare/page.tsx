"use client"

import { useState, useEffect } from "react"
import { useLanguage } from "@/components/language-provider"
import { Plus, Search, Trash2, Edit, Loader2, ShieldCheck, User as UserIcon, X, Eye, EyeOff, Shield } from "lucide-react"
import { createUserAction, updateUserRoleAndPermissions, deleteUserAction, listOrganisationUsers } from "@/app/actions/users"
import { useActiveOrg } from "@/hooks/useActiveOrg"
import { DEPARTMENTS } from "@/lib/permissions"

type UserProfile = {
    id: string
    email: string
    role: 'superadmin' | 'admin' | 'user'
    permissions: string[]
    created_at: string
}

const SECTION_OPTIONS = DEPARTMENTS.map(d => ({ id: d.id, labelSv: d.labelSv, labelEn: d.labelEn }))

const roleBadge = (role: string) => {
    if (role === 'superadmin') return { bg: '#EDE9FE', color: '#6D28D9', label: 'Superadmin' }
    if (role === 'admin')      return { bg: '#D1FAE5', color: '#065F46', label: 'Admin' }
    return { bg: '#F3F4F6', color: '#6B7280', label: 'Användare' }
}

export default function UsersPage() {
    const { t, language } = useLanguage()
    const { canManageUsers, isSuperAdmin, activeOrgId, loading: orgLoading } = useActiveOrg()
    const [users, setUsers]                     = useState<UserProfile[]>([])
    const [loading, setLoading]                 = useState(true)
    const [searchQuery, setSearchQuery]         = useState("")
    const currentUserRole = isSuperAdmin ? 'superadmin' : canManageUsers ? 'admin' : 'user'
    // Detect missing service role key from error messages
    const [missingServiceKey, setMissingServiceKey] = useState(false)

    // Modals
    const [showCreate, setShowCreate]           = useState(false)
    const [showEdit, setShowEdit]               = useState(false)
    const [selectedUser, setSelectedUser]       = useState<UserProfile | null>(null)
    const [deleteTarget, setDeleteTarget]       = useState<UserProfile | null>(null)

    // Form state
    const [isSubmitting, setIsSubmitting]       = useState(false)
    const [errorMsg, setErrorMsg]               = useState("")
    const [showPassword, setShowPassword]       = useState(false)

    // New user
    const [newEmail, setNewEmail]               = useState("")
    const [newPassword, setNewPassword]         = useState("")
    const [newRole, setNewRole]                 = useState<'admin' | 'user'>('user')
    const [newPermissions, setNewPermissions]   = useState<string[]>([])

    // Edit user
    const [editRole, setEditRole]               = useState<'superadmin' | 'admin' | 'user'>('user')
    const [editPermissions, setEditPermissions] = useState<string[]>([])

    const fetchUsers = async () => {
        setLoading(true)
        try {
            const result = await listOrganisationUsers()
            if (result.success) setUsers(result.users)
        } catch { /* ignore */ }
        setLoading(false)
    }

    useEffect(() => { fetchUsers() }, [activeOrgId])

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg("")
        setIsSubmitting(true)
        const formData = new FormData()
        formData.append('email', newEmail)
        formData.append('password', newPassword)
        formData.append('role', newRole)
        newPermissions.forEach(p => formData.append('permissions', p))
        const result = await createUserAction(formData)
        if (result.success) {
            setShowCreate(false)
            setNewEmail(""); setNewPassword(""); setNewRole("user"); setNewPermissions([])
            setMissingServiceKey(false)
            fetchUsers()
        } else {
            const errText = result.error || (language === 'sv' ? 'Ett fel uppstod.' : 'An error occurred.')
            if (errText.includes('SUPABASE_SERVICE_ROLE_KEY')) {
                setMissingServiceKey(true)
                setShowCreate(false)
            }
            setErrorMsg(errText)
        }
        setIsSubmitting(false)
    }

    const openEditModal = (user: UserProfile) => {
        setSelectedUser(user)
        setEditRole(user.role)
        setEditPermissions(user.permissions || [])
        setErrorMsg("")
        setShowEdit(true)
    }

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedUser) return
        setErrorMsg("")
        setIsSubmitting(true)
        const result = await updateUserRoleAndPermissions(selectedUser.id, editRole, editPermissions)
        if (result.success) {
            setShowEdit(false)
            fetchUsers()
        } else {
            setErrorMsg(result.error || (language === 'sv' ? 'Misslyckades att uppdatera.' : 'Failed to update.'))
        }
        setIsSubmitting(false)
    }

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return
        if (deleteTarget.role === 'superadmin' && currentUserRole !== 'superadmin') {
            setDeleteTarget(null)
            return
        }
        const result = await deleteUserAction(deleteTarget.id)
        setDeleteTarget(null)
        if (result.success) fetchUsers()
    }

    const togglePerm = (id: string, perms: string[], setPerms: (p: string[]) => void) =>
        setPerms(perms.includes(id) ? perms.filter(p => p !== id) : [...perms, id])

    const filtered = users.filter(u => u.email?.toLowerCase().includes(searchQuery.toLowerCase()))

    if (orgLoading) {
        return (
            <div className="flex items-center justify-center h-[50vh] text-muted-foreground">
                <Loader2 size={20} className="animate-spin mr-2" />
                {t('common.loading')}
            </div>
        )
    }

    if (!canManageUsers) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="text-center">
                    <Shield size={48} style={{ color: '#DDD8CE' }} className="mx-auto mb-4" />
                    <h2 className="text-xl font-bold">{language === 'sv' ? 'Åtkomst nekad' : 'Access denied'}</h2>
                    <p className="text-muted-foreground mt-2">{language === 'sv' ? 'Du måste vara admin för att hantera användare.' : 'You must be admin to manage users.'}</p>
                </div>
            </div>
        )
    }

    return (
        <div>
            {/* Service Role Key missing — persistent banner */}
            {missingServiceKey && (
                <div className="mb-5 p-4 rounded-[14px] border text-sm" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B' }}>
                    <p className="font-bold mb-2">
                        🔑 {language === 'sv' ? 'SUPABASE_SERVICE_ROLE_KEY saknas' : 'SUPABASE_SERVICE_ROLE_KEY is missing'}
                    </p>
                    <p className="mb-3">
                        {language === 'sv'
                            ? 'Denna nyckel krävs för att skapa och radera användare. Följ stegen:'
                            : 'This key is required to create and delete users. Follow these steps:'}
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 text-xs" style={{ color: '#7F1D1D' }}>
                        <li>
                            {language === 'sv' ? 'Gå till ' : 'Go to '}
                            <strong>Supabase Dashboard → Settings → API</strong>
                        </li>
                        <li>
                            {language === 'sv' ? 'Kopiera ' : 'Copy '}
                            <strong>service_role</strong>
                            {language === 'sv' ? '-nyckeln (secret)' : ' key (secret)'}
                        </li>
                        <li>
                            {language === 'sv' ? 'Skapa/öppna filen ' : 'Create/open the file '}
                            <code className="font-mono bg-red-100 px-1 rounded">.env.local</code>
                            {language === 'sv' ? ' i projektets rotmapp' : ' in your project root'}
                        </li>
                        <li>
                            {language === 'sv' ? 'Lägg till raden:' : 'Add the line:'}
                            <code className="block font-mono bg-red-100 px-2 py-1 rounded mt-1 text-xs">
                                SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...din-nyckel
                            </code>
                        </li>
                        <li>
                            {language === 'sv' ? 'Starta om dev-servern med ' : 'Restart the dev server with '}
                            <code className="font-mono bg-red-100 px-1 rounded">npm run dev</code>
                        </li>
                    </ol>
                    <p className="mt-3 text-xs" style={{ color: '#7F1D1D' }}>
                        {language === 'sv'
                            ? 'Se filen .env.local.example i projektroten för en komplett mall.'
                            : 'See .env.local.example in the project root for a complete template.'}
                    </p>
                </div>
            )}

            {errorMsg && !missingServiceKey && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-[10px] text-sm">{errorMsg}</div>
            )}

            <div className="page-header flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('page.users.title')}</h1>
                    <p className="text-muted-foreground text-sm mt-1">{t('page.users.desc')}</p>
                </div>
                <button onClick={() => { setErrorMsg(""); setMissingServiceKey(false); setShowCreate(true) }}
                    className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-primary-foreground"
                    style={{ background: '#1A1A1A' }}>
                    <Plus size={15} /> {t('page.users.add')}
                </button>
            </div>

            <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 border-b border-border" style={{ background: '#F7F3EC' }}>
                    <span className="font-semibold text-sm">{language === 'sv' ? 'Användare i denna organisation' : 'Users in this organisation'}</span>
                    <div className="relative w-full sm:w-64">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            placeholder={t('page.users.search')}
                            className="input-premium pl-8 py-1.5 text-sm"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="overflow-x-auto table-scroll-wrapper">
                    <table className="premium-table">
                        <thead>
                            <tr>
                                <th>{language === 'sv' ? 'E-post' : 'Email'}</th>
                                <th>{language === 'sv' ? 'Roll' : 'Role'}</th>
                                <th>{language === 'sv' ? 'Behörigheter' : 'Permissions'}</th>
                                <th className="text-right">{language === 'sv' ? 'Åtgärder' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i}><td colSpan={4}><div className="h-4 bg-secondary rounded animate-pulse" /></td></tr>
                                ))
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">
                                    {users.length === 0
                                        ? (language === 'sv' ? 'Inga användare ännu.' : 'No users yet.')
                                        : (language === 'sv' ? 'Inga träffar.' : 'No matches.')}
                                </td></tr>
                            ) : (
                                filtered.map(user => {
                                    const badge = roleBadge(user.role)
                                    return (
                                        <tr key={user.id}>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    {user.role === 'superadmin'
                                                        ? <ShieldCheck size={15} style={{ color: '#6D28D9' }} />
                                                        : <UserIcon size={15} className="text-muted-foreground" />}
                                                    <span className="font-medium">{user.email}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge text-xs font-semibold px-2.5 py-1 rounded-full"
                                                    style={{ background: badge.bg, color: badge.color }}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td>
                                                {user.role === 'superadmin' || user.role === 'admin' ? (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        {language === 'sv' ? 'Fullständig åtkomst' : 'Full access'}
                                                    </span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1">
                                                        {user.permissions?.length > 0 ? user.permissions.map(p => (
                                                            <span key={p} className="px-1.5 py-0.5 border border-border rounded text-[10px] uppercase tracking-wider text-muted-foreground">
                                                                {p}
                                                            </span>
                                                        )) : (
                                                            <span className="text-xs text-muted-foreground italic">
                                                                {language === 'sv' ? 'Ingen redigering' : 'View only'}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => openEditModal(user)}
                                                        aria-label={language === 'sv' ? 'Redigera' : 'Edit'}
                                                        className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                                                        <Edit size={14} className="text-muted-foreground" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteTarget(user)}
                                                        aria-label={language === 'sv' ? 'Radera' : 'Delete'}
                                                        disabled={user.role === 'superadmin' && currentUserRole !== 'superadmin'}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-30">
                                                        <Trash2 size={14} style={{ color: '#C0392B' }} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                {!loading && (
                    <div className="px-5 py-3 border-t border-border bg-secondary/30 text-xs text-muted-foreground">
                        {filtered.length} {language === 'sv' ? 'användare' : 'users'}
                    </div>
                )}
            </div>

            {/* Create modal */}
            {showCreate && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-md">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <h2 className="text-lg font-bold">{language === 'sv' ? 'Skapa ny användare' : 'Create new user'}</h2>
                            <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
                        </div>
                        <form onSubmit={handleCreateSubmit}>
                            <div className="p-6 space-y-4">
                                {errorMsg && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-[10px] text-sm">{errorMsg}</div>}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">{language === 'sv' ? 'E-post' : 'Email'}</label>
                                    <input type="email" className="input-premium" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">{language === 'sv' ? 'Lösenord' : 'Password'}</label>
                                    <div className="relative">
                                        <input type={showPassword ? 'text' : 'password'} className="input-premium pr-10"
                                            value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{language === 'sv' ? 'Minst 8 tecken' : 'Minimum 8 characters'}</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">{language === 'sv' ? 'Roll' : 'Role'}</label>
                                    <select className="input-premium" value={newRole} onChange={e => setNewRole(e.target.value as any)}>
                                        <option value="user">{language === 'sv' ? 'Användare' : 'User'}</option>
                                        <option value="admin">{language === 'sv' ? 'Administratör' : 'Administrator'}</option>
                                    </select>
                                </div>
                                {newRole === 'user' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold">{language === 'sv' ? 'Kan redigera' : 'Can edit'}</label>
                                        <p className="text-xs text-muted-foreground">
                                            {language === 'sv'
                                                ? 'Användaren kan se alla avdelningar men bara redigera de som är ikryssade. Inställningar, användare och aktivitetsloggar är bara för administratörer.'
                                                : 'The user can view every department but only edit the ones you tick. Settings, users and activity logs are for administrators only.'}
                                        </p>
                                        <div className="border border-border rounded-[10px] p-3 space-y-2 bg-secondary/30">
                                            {SECTION_OPTIONS.map(s => (
                                                <label key={s.id} className="flex items-center gap-2.5 cursor-pointer">
                                                    <input type="checkbox" className="rounded" checked={newPermissions.includes(s.id)}
                                                        onChange={() => togglePerm(s.id, newPermissions, setNewPermissions)} />
                                                    <span className="text-sm">{language === 'sv' ? s.labelSv : s.labelEn}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 p-6 pt-0">
                                <button type="button" onClick={() => setShowCreate(false)}
                                    className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">
                                    {t('common.cancel')}
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-sm font-semibold text-primary-foreground disabled:opacity-60"
                                    style={{ background: '#1A1A1A' }}>
                                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                                    {language === 'sv' ? 'Skapa konto' : 'Create account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit modal */}
            {showEdit && selectedUser && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-md">
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <div>
                                <h2 className="text-lg font-bold">{language === 'sv' ? 'Redigera behörighet' : 'Edit permissions'}</h2>
                                <p className="text-sm text-muted-foreground mt-0.5">{selectedUser.email}</p>
                            </div>
                            <button onClick={() => setShowEdit(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={16} /></button>
                        </div>
                        <form onSubmit={handleEditSubmit}>
                            <div className="p-6 space-y-4">
                                {errorMsg && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-[10px] text-sm">{errorMsg}</div>}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">{language === 'sv' ? 'Roll' : 'Role'}</label>
                                    <select className="input-premium" value={editRole}
                                        onChange={e => setEditRole(e.target.value as any)}
                                        disabled={selectedUser.role === 'superadmin' && currentUserRole !== 'superadmin'}>
                                        <option value="user">{language === 'sv' ? 'Användare' : 'User'}</option>
                                        <option value="admin">{language === 'sv' ? 'Administratör' : 'Administrator'}</option>
                                        {currentUserRole === 'superadmin' && <option value="superadmin">Superadmin</option>}
                                    </select>
                                </div>
                                {editRole === 'user' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold">{language === 'sv' ? 'Kan redigera' : 'Can edit'}</label>
                                        <p className="text-xs text-muted-foreground">
                                            {language === 'sv'
                                                ? 'Användaren kan se alla avdelningar men bara redigera de som är ikryssade.'
                                                : 'The user can view every department but only edit the ones you tick.'}
                                        </p>
                                        <div className="border border-border rounded-[10px] p-3 space-y-2 bg-secondary/30">
                                            {SECTION_OPTIONS.map(s => (
                                                <label key={s.id} className="flex items-center gap-2.5 cursor-pointer">
                                                    <input type="checkbox" className="rounded" checked={editPermissions.includes(s.id)}
                                                        onChange={() => togglePerm(s.id, editPermissions, setEditPermissions)} />
                                                    <span className="text-sm">{language === 'sv' ? s.labelSv : s.labelEn}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 p-6 pt-0">
                                <button type="button" onClick={() => setShowEdit(false)}
                                    className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">
                                    {t('common.cancel')}
                                </button>
                                <button type="submit" disabled={isSubmitting}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-sm font-semibold text-primary-foreground disabled:opacity-60"
                                    style={{ background: '#1A1A1A' }}>
                                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                                    {t('common.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete confirmation modal */}
            {deleteTarget && (
                <div className="modal-overlay">
                    <div className="modal-content max-w-sm">
                        <div className="p-6">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={20} style={{ color: '#C0392B' }} />
                            </div>
                            <h2 className="text-lg font-bold text-center mb-2">
                                {language === 'sv' ? 'Radera användare?' : 'Delete user?'}
                            </h2>
                            <p className="text-sm text-muted-foreground text-center mb-6">
                                {deleteTarget.email}
                                <br />
                                {language === 'sv' ? 'Detta kan inte ångras.' : 'This cannot be undone.'}
                            </p>
                            <div className="flex gap-3">
                                <button onClick={() => setDeleteTarget(null)}
                                    className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold border border-border hover:bg-secondary transition-colors">
                                    {t('common.cancel')}
                                </button>
                                <button onClick={handleDeleteConfirm}
                                    className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white"
                                    style={{ background: '#C0392B' }}>
                                    {language === 'sv' ? 'Radera' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
