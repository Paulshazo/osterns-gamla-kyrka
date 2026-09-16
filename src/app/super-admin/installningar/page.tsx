"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
    ArrowLeft, Eye, EyeOff, Loader2, Lock, Plus, Trash2, UserPlus, Users,
} from "lucide-react"
import { changePasswordAction } from "@/app/actions/settings"
import {
    createSuperUserAction, deleteSuperUserAction, isServiceRoleConfigured, listSuperUsers,
} from "@/app/actions/users"
import { getMyPlatformRole } from "@/app/actions/org"
import type { ProfileRole } from "@/lib/permissions"

type SuperUser = {
    id: string
    email: string | null
    role: string
    created_at: string
}

export default function SuperAdminSettingsPage() {
    const [role, setRole] = useState<ProfileRole | null>(null)
    const [superUsers, setSuperUsers] = useState<SuperUser[]>([])
    const [loading, setLoading] = useState(true)
    const [listError, setListError] = useState<string | null>(null)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPw, setShowPw] = useState(false)
    const [savingPw, setSavingPw] = useState(false)

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showCreatePw, setShowCreatePw] = useState(false)
    const [creating, setCreating] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [serviceRoleConfigured, setServiceRoleConfigured] = useState(true)

    const isAdmin = role === 'superadmin'

    const showMsg = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text })
        if (type === 'success') setTimeout(() => setMessage(null), 3500)
    }

    const refresh = async () => {
        setListError(null)
        const [me, svc] = await Promise.all([getMyPlatformRole(), isServiceRoleConfigured()])
        if (me.success) setRole(me.role)
        setServiceRoleConfigured(svc.configured)

        if (me.success && me.role === 'superadmin') {
            const list = await listSuperUsers()
            if (list.success) {
                setSuperUsers(list.users as SuperUser[])
            } else {
                setSuperUsers([])
                setListError(list.error ?? 'Kunde inte hämta super användare.')
            }
        } else {
            setSuperUsers([])
        }
        setLoading(false)
    }

    useEffect(() => { refresh() }, [])

    const handlePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setSavingPw(true)
        setMessage(null)
        const result = await changePasswordAction({ currentPassword, newPassword, confirmPassword })
        if (result.success) {
            showMsg('success', 'Lösenordet har uppdaterats.')
            setCurrentPassword(""); setNewPassword(""); setConfirmPassword("")
        } else {
            showMsg('error', result.error || 'Kunde inte byta lösenord.')
        }
        setSavingPw(false)
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isAdmin) return
        setCreating(true)
        setMessage(null)
        const formData = new FormData()
        formData.set('email', email)
        formData.set('password', password)
        const result = await createSuperUserAction(formData)
        if (result.success) {
            showMsg('success', result.message || 'Super användare skapad!')
            setEmail(""); setPassword("")
            await refresh()
        } else {
            showMsg('error', result.error || 'Kunde inte skapa.')
        }
        setCreating(false)
    }

    const handleDelete = async (u: SuperUser) => {
        if (!isAdmin) return
        if (!serviceRoleConfigured) {
            showMsg('error', 'SUPABASE_SERVICE_ROLE_KEY saknas i Vercel — krävs för att radera konton.')
            return
        }
        if (!confirm(`Radera super användare ${u.email}?\n\nDetta tar bort kontot permanent.`)) return
        setDeletingId(u.id)
        const result = await deleteSuperUserAction(u.id)
        if (result.success) {
            showMsg('success', 'Super användare raderad.')
            await refresh()
        } else {
            showMsg('error', result.error || 'Kunde inte radera.')
        }
        setDeletingId(null)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin" size={24} style={{ color: '#C9A84C' }} />
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-3">
                <Link href="/super-admin" className="p-2 rounded-lg hover:bg-black/5">
                    <ArrowLeft size={18} style={{ color: '#6B6355' }} />
                </Link>
                <div>
                    <h2 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>Inställningar</h2>
                    <p className="text-sm" style={{ color: '#8A8178' }}>
                        {isAdmin ? 'Lösenord och hantering av super användare' : 'Byt ditt lösenord'}
                    </p>
                </div>
            </div>

            {message && (
                <div className={`p-4 rounded-[10px] text-sm border font-medium ${
                    message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                }`}>{message.text}</div>
            )}

            {listError && isAdmin && (
                <div className="p-4 rounded-[10px] text-sm border bg-red-50 text-red-700 border-red-200">
                    {listError}
                    {listError.includes('superuser') && (
                        <p className="mt-2 text-xs">Kör SQL-steg 1 i Supabase (ALTER TYPE … ADD VALUE superuser) om du inte redan gjort det.</p>
                    )}
                </div>
            )}

            {/* Password — all platform staff */}
            <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center gap-2" style={{ background: '#F7F3EC' }}>
                    <Lock size={16} style={{ color: '#C9A84C' }} /> Byt lösenord
                </div>
                <form onSubmit={handlePassword} className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold">Nuvarande lösenord</label>
                        <input type={showPw ? 'text' : 'password'} className="input-premium" value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)} required />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Nytt lösenord</label>
                            <div className="relative">
                                <input type={showPw ? 'text' : 'password'} className="input-premium pr-10"
                                    value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} />
                                <button type="button" onClick={() => setShowPw(!showPw)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Upprepa nytt lösenord</label>
                            <input type={showPw ? 'text' : 'password'} className="input-premium"
                                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={savingPw}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-60"
                            style={{ background: '#1A1A1A', color: '#FEFCF8' }}>
                            {savingPw && <Loader2 size={14} className="animate-spin" />}
                            Spara lösenord
                        </button>
                    </div>
                </form>
            </div>

            {/* Super användare — superadmin only */}
            {isAdmin && (
                <>
                    {!serviceRoleConfigured && (
                        <div className="p-4 rounded-[14px] border text-sm" style={{ background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}>
                            <p className="font-bold mb-1">Radering kräver SUPABASE_SERVICE_ROLE_KEY</p>
                            <p className="text-xs">Skapa fungerar utan nyckeln. För att <strong>radera</strong> super användare: lägg till service_role i Vercel → Environment Variables och redeploya.</p>
                        </div>
                    )}

                    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center justify-between" style={{ background: '#F7F3EC' }}>
                            <span className="flex items-center gap-2">
                                <Users size={16} style={{ color: '#C9A84C' }} />
                                Super användare ({superUsers.length})
                            </span>
                            <span className="text-xs font-normal" style={{ color: '#8A8178' }}>Syns inte i organisationer</span>
                        </div>
                        <div className="divide-y divide-border">
                            {superUsers.map(u => (
                                <div key={u.id} className="flex items-center gap-3 px-6 py-3">
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                        style={{ background: '#8B6914' }}>
                                        {(u.email ?? '?')[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{u.email}</p>
                                        <p className="text-xs" style={{ color: '#8A8178' }}>
                                            Bevakning · kan se alla orgar · kan inte ändra data
                                            {u.created_at && ` · skapad ${new Date(u.created_at).toLocaleDateString('sv-SE')}`}
                                        </p>
                                    </div>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                        style={{ background: '#FEF3C7', color: '#92400E' }}>
                                        Super användare
                                    </span>
                                    <button
                                        onClick={() => handleDelete(u)}
                                        disabled={!serviceRoleConfigured || deletingId === u.id}
                                        title={serviceRoleConfigured ? 'Radera konto' : 'Kräver SUPABASE_SERVICE_ROLE_KEY i Vercel'}
                                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                        {deletingId === u.id
                                            ? <Loader2 size={13} className="animate-spin text-red-400" />
                                            : <Trash2 size={13} className="text-red-400" />}
                                    </button>
                                </div>
                            ))}
                            {superUsers.length === 0 && !listError && (
                                <div className="px-6 py-8 text-center text-sm" style={{ color: '#8A8178' }}>
                                    Inga super användare ännu. Skapa en nedan.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center gap-2" style={{ background: '#F7F3EC' }}>
                            <UserPlus size={16} style={{ color: '#C9A84C' }} /> Lägg till super användare
                        </div>
                        <form onSubmit={handleCreate} className="p-6 space-y-4">
                            <p className="text-xs" style={{ color: '#8A8178' }}>
                                Super användare kan logga in, se alla organisationer och bevaka data — men kan inte skapa, redigera eller radera något.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">E-post</label>
                                    <input type="email" className="input-premium" value={email}
                                        onChange={e => setEmail(e.target.value)} required />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">Lösenord</label>
                                    <div className="relative">
                                        <input type={showCreatePw ? 'text' : 'password'} className="input-premium pr-10"
                                            value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
                                        <button type="button" onClick={() => setShowCreatePw(!showCreatePw)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                            {showCreatePw ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <button type="submit" disabled={creating}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-60"
                                    style={{ background: '#1A1A1A', color: '#FEFCF8' }}>
                                    {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    Skapa super användare
                                </button>
                            </div>
                        </form>
                    </div>
                </>
            )}

            {!isAdmin && (
                <div className="p-4 rounded-[10px] text-sm border" style={{ background: '#F7F3EC', borderColor: '#E5E0D8', color: '#6B6355' }}>
                    Du är inloggad som <strong>super användare</strong>. Endast superadmin kan hantera andra super användare här.
                </div>
            )}
        </div>
    )
}
