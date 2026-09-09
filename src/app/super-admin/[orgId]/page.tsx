"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import {
    ArrowLeft, Users, Settings, Loader2, CheckCircle, XCircle,
    Save, BarChart3, UserPlus, Trash2, Eye, Shield, CreditCard,
} from "lucide-react"
import {
    updateOrganisation, getOrgMembers, setActiveOrganisation,
    addOrgMember, removeOrgMember, updateOrgMemberRole, getAllUsers,
} from "@/app/actions/org"

const ALL_PERMISSIONS = [
    { key: 'register', label: 'Register' },
    { key: 'payments', label: 'Betalningar' },
    { key: 'expenses', label: 'Utgifter' },
    { key: 'income', label: 'Intakter' },
    { key: 'stats', label: 'Statistik' },
    { key: 'settings', label: 'Inställningar' },
    { key: 'users', label: 'Användare' },
]

interface OrgMember {
    id: string; user_id: string; role: string; permissions: string[]
    is_active: boolean; created_at: string
    user_profiles: { email: string; role: string } | null
}

interface UserProfile {
    id: string; email: string; role: string; permissions: string[]
}

export default function OrgDetailPage() {
    const params = useParams()
    const router = useRouter()
    const orgId = params.orgId as string
    const supabase = useMemo(() => { try { return createClient() } catch { return null } }, [])

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [org, setOrg] = useState<any>(null)
    const [members, setMembers] = useState<OrgMember[]>([])
    const [allUsers, setAllUsers] = useState<UserProfile[]>([])
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [stats, setStats] = useState({ familjer: 0, betalningar: 0, intakter: 0, utgifter: 0 })
    const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'settings'>('overview')

    // Edit org fields
    const [name, setName] = useState("")
    const [slug, setSlug] = useState("")
    const [isActive, setIsActive] = useState(true)
    const [primaryColor, setPrimaryColor] = useState("#C9A84C")

    // Add member
    const [showAddMember, setShowAddMember] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState("")
    const [selectedRole, setSelectedRole] = useState("user")
    const [selectedPerms, setSelectedPerms] = useState<string[]>([])
    const [addingMember, setAddingMember] = useState(false)

    // Edit member
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
    const [editRole, setEditRole] = useState("user")
    const [editPerms, setEditPerms] = useState<string[]>([])

    const showMsg = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text })
        if (type === 'success') setTimeout(() => setMessage(null), 3000)
    }

    const fetchAll = async () => {
        if (!supabase) return
        // Org details
        const { data: orgData } = await supabase.from('organisations').select('*').eq('id', orgId).single()
        if (orgData) {
            setOrg(orgData); setName(orgData.name); setSlug(orgData.slug)
            setIsActive(orgData.is_active); setPrimaryColor(orgData.primary_color || '#C9A84C')
        }
        // Members
        const membersData = await getOrgMembers(orgId)
        setMembers(membersData)
        // All users (for adding)
        const users = await getAllUsers()
        setAllUsers(users)
        // Stats
        try {
            const [f, b, i, u] = await Promise.all([
                supabase.from('familjer').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId),
                supabase.from('betalningar').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId),
                supabase.from('intakter').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId),
                supabase.from('utgifter').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId),
            ])
            setStats({ familjer: f.count ?? 0, betalningar: b.count ?? 0, intakter: i.count ?? 0, utgifter: u.count ?? 0 })
        } catch { /* ignore */ }
        setLoading(false)
    }

    useEffect(() => { fetchAll() }, [supabase, orgId])

    const handleSaveOrg = async () => {
        setSaving(true); setMessage(null)
        try {
            const result = await updateOrganisation(orgId, { name, slug, is_active: isActive, primary_color: primaryColor })
            if (!result.success) throw new Error(result.error)
            showMsg('success', 'Organisation uppdaterad!')
        } catch (err: any) { showMsg('error', err.message) }
        finally { setSaving(false) }
    }

    const handleAddMember = async () => {
        if (!selectedUserId) return
        setAddingMember(true)
        try {
            const result = await addOrgMember(orgId, selectedUserId, selectedRole, selectedPerms)
            if (!result.success) throw new Error(result.error)
            showMsg('success', 'Medlem tillagd!')
            setShowAddMember(false); setSelectedUserId(""); setSelectedRole("user"); setSelectedPerms([])
            const membersData = await getOrgMembers(orgId)
            setMembers(membersData)
        } catch (err: any) { showMsg('error', err.message) }
        finally { setAddingMember(false) }
    }

    const handleRemoveMember = async (userId: string, email: string) => {
        if (!confirm(`Ta bort ${email} från denna organisation?`)) return
        try {
            const result = await removeOrgMember(orgId, userId)
            if (!result.success) throw new Error(result.error)
            showMsg('success', `${email} borttagen.`)
            const membersData = await getOrgMembers(orgId)
            setMembers(membersData)
        } catch (err: any) { showMsg('error', err.message) }
    }

    const handleUpdateMember = async (userId: string) => {
        try {
            const result = await updateOrgMemberRole(orgId, userId, editRole, editPerms)
            if (!result.success) throw new Error(result.error)
            showMsg('success', 'Roll uppdaterad!')
            setEditingMemberId(null)
            const membersData = await getOrgMembers(orgId)
            setMembers(membersData)
        } catch (err: any) { showMsg('error', err.message) }
    }

    const handleImpersonate = async () => {
        await setActiveOrganisation(orgId)
        window.location.href = "/"
    }

    // Users not yet in this org
    const availableUsers = allUsers.filter(u => !members.find(m => m.user_id === u.id))

    const togglePerm = (perms: string[], perm: string) =>
        perms.includes(perm) ? perms.filter(p => p !== perm) : [...perms, perm]

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin" size={24} style={{ color: '#C9A84C' }} />
        </div>
    )

    if (!org) return (
        <div className="text-center py-20">
            <p style={{ color: '#8A8178' }}>Organisation hittades inte.</p>
            <a href="/super-admin" className="text-sm underline mt-2 inline-block" style={{ color: '#C9A84C' }}>Tillbaka</a>
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <a href="/super-admin" className="p-2 rounded-lg transition-colors hover:bg-black/5">
                    <ArrowLeft size={20} style={{ color: '#6B6355' }} />
                </a>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ background: primaryColor }}>
                        {org.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>{org.name}</h2>
                        <p className="text-xs" style={{ color: '#8A8178' }}>/{org.slug} · {members.length} användare</p>
                    </div>
                </div>
                <button onClick={handleImpersonate}
                    className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold"
                    style={{ background: '#1A1A1A', color: '#C9A84C' }}>
                    <Eye size={14} /> Öppna dashboard
                </button>
            </div>

            {message && (
                <div className={`p-4 rounded-[10px] text-sm border font-medium ${
                    message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
                }`}>{message.text}</div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-[10px]" style={{ background: '#F0EBE0' }}>
                {[
                    { key: 'overview', label: 'Översikt', icon: BarChart3 },
                    { key: 'members', label: `Användare (${members.length})`, icon: Users },
                    { key: 'settings', label: 'Inställningar', icon: Settings },
                ].map(tab => (
                    <button key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-medium transition-all flex-1 justify-center"
                        style={{
                            background: activeTab === tab.key ? 'white' : 'transparent',
                            color: activeTab === tab.key ? '#1A1A1A' : '#8A8178',
                            boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}>
                        <tab.icon size={14} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Familjer', value: stats.familjer, icon: Users, color: '#C9A84C' },
                            { label: 'Betalningar', value: stats.betalningar, icon: CreditCard, color: '#6366F1' },
                            { label: 'Intäkter', value: stats.intakter, icon: BarChart3, color: '#22C55E' },
                            { label: 'Utgifter', value: stats.utgifter, icon: BarChart3, color: '#EF4444' },
                        ].map(s => (
                            <div key={s.label} className="bg-card border border-border rounded-[12px] p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <s.icon size={14} style={{ color: s.color }} />
                                    <span className="text-xs font-medium" style={{ color: '#8A8178' }}>{s.label}</span>
                                </div>
                                <span className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>{s.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Quick members list */}
                    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border" style={{ background: '#F7F3EC' }}>
                            <span className="font-semibold text-sm flex items-center gap-2">
                                <Users size={16} style={{ color: '#C9A84C' }} /> Användare
                            </span>
                            <button onClick={() => setActiveTab('members')}
                                className="text-xs font-medium" style={{ color: '#C9A84C' }}>
                                Visa alla →
                            </button>
                        </div>
                        <div className="divide-y divide-border">
                            {members.slice(0, 5).map(m => (
                                <div key={m.id} className="flex items-center gap-3 px-6 py-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                        style={{ background: m.role === 'admin' ? '#C9A84C' : m.role === 'superadmin' ? '#6366F1' : '#9CA3AF' }}>
                                        {(m.user_profiles?.email ?? '?')[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{m.user_profiles?.email ?? m.user_id}</p>
                                    </div>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                        style={{
                                            background: m.role === 'admin' ? '#FEF3C7' : m.role === 'superadmin' ? '#EDE9FE' : '#F3F4F6',
                                            color: m.role === 'admin' ? '#92400E' : m.role === 'superadmin' ? '#5B21B6' : '#6B7280',
                                        }}>{m.role}</span>
                                </div>
                            ))}
                            {members.length === 0 && (
                                <div className="px-6 py-6 text-center text-sm" style={{ color: '#8A8178' }}>Inga användare</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MEMBERS TAB */}
            {activeTab === 'members' && (
                <div className="space-y-4">
                    {/* Add member */}
                    <div className="flex justify-end">
                        <button onClick={() => setShowAddMember(!showAddMember)}
                            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold"
                            style={{ background: '#1A1A1A', color: '#FEFCF8' }}>
                            <UserPlus size={14} /> Lägg till användare
                        </button>
                    </div>

                    {showAddMember && (
                        <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                            <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center gap-2" style={{ background: '#F7F3EC' }}>
                                <UserPlus size={16} style={{ color: '#C9A84C' }} /> Lägg till användare i {org.name}
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold">Välj användare</label>
                                        <select className="input-premium" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                                            <option value="">-- Välj --</option>
                                            {availableUsers.map(u => (
                                                <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                                            ))}
                                        </select>
                                        {availableUsers.length === 0 && (
                                            <p className="text-xs" style={{ color: '#8A8178' }}>Alla användare är redan tillagda i denna org.</p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold">Roll i organisationen</label>
                                        <select className="input-premium" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                                            <option value="user">Användare</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold">Behörigheter</label>
                                    <div className="flex flex-wrap gap-2">
                                        {ALL_PERMISSIONS.map(p => (
                                            <button key={p.key} type="button"
                                                onClick={() => setSelectedPerms(togglePerm(selectedPerms, p.key))}
                                                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-all"
                                                style={{
                                                    background: selectedPerms.includes(p.key) ? '#1A1A1A' : 'white',
                                                    color: selectedPerms.includes(p.key) ? '#C9A84C' : '#6B6355',
                                                    borderColor: selectedPerms.includes(p.key) ? '#1A1A1A' : '#E5E0D8',
                                                }}>
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setShowAddMember(false)}
                                        className="px-4 py-2 rounded-[10px] text-sm" style={{ color: '#6B6355' }}>Avbryt</button>
                                    <button onClick={handleAddMember} disabled={!selectedUserId || addingMember}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-60"
                                        style={{ background: '#1A1A1A', color: '#FEFCF8' }}>
                                        {addingMember ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                                        Lägg till
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Members list */}
                    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center gap-2" style={{ background: '#F7F3EC' }}>
                            <Users size={16} style={{ color: '#C9A84C' }} /> Användare i {org.name} ({members.length})
                        </div>
                        <div className="divide-y divide-border">
                            {members.map((m) => {
                                const isEditing = editingMemberId === m.user_id
                                return (
                                    <div key={m.id} className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                                style={{ background: m.role === 'admin' ? '#C9A84C' : m.role === 'superadmin' ? '#6366F1' : '#9CA3AF' }}>
                                                {(m.user_profiles?.email ?? '?')[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate" style={{ color: '#1A1A1A' }}>
                                                    {m.user_profiles?.email ?? m.user_id}
                                                </p>
                                                <p className="text-xs" style={{ color: '#8A8178' }}>
                                                    Tillagd {new Date(m.created_at).toLocaleDateString('sv-SE')}
                                                    {m.permissions?.length > 0 && ` · ${m.permissions.join(', ')}`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {m.is_active ? <CheckCircle size={13} style={{ color: '#22C55E' }} /> : <XCircle size={13} style={{ color: '#EF4444' }} />}
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                                    style={{
                                                        background: m.role === 'admin' ? '#FEF3C7' : m.role === 'superadmin' ? '#EDE9FE' : '#F3F4F6',
                                                        color: m.role === 'admin' ? '#92400E' : m.role === 'superadmin' ? '#5B21B6' : '#6B7280',
                                                    }}>{m.role}</span>
                                                <button onClick={() => {
                                                    if (isEditing) { setEditingMemberId(null) } else {
                                                        setEditingMemberId(m.user_id); setEditRole(m.role); setEditPerms(m.permissions ?? [])
                                                    }
                                                }}
                                                    className="text-xs px-2.5 py-1.5 rounded-[6px] font-medium transition-colors"
                                                    style={{ background: isEditing ? '#C9A84C' : '#F7F3EC', color: isEditing ? 'white' : '#1A1A1A' }}>
                                                    {isEditing ? 'Avbryt' : 'Redigera'}
                                                </button>
                                                <button onClick={() => handleRemoveMember(m.user_id, m.user_profiles?.email ?? '')}
                                                    className="p-1.5 rounded-[6px] hover:bg-red-50 transition-colors">
                                                    <Trash2 size={13} className="text-red-400" />
                                                </button>
                                            </div>
                                        </div>
                                        {/* Edit inline */}
                                        {isEditing && (
                                            <div className="mt-4 p-4 rounded-[10px] space-y-3" style={{ background: '#F7F3EC' }}>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-semibold">Roll</label>
                                                        <select className="input-premium mt-1" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                                                            <option value="user">Användare</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-semibold">Behörigheter</label>
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        {ALL_PERMISSIONS.map(p => (
                                                            <button key={p.key} type="button"
                                                                onClick={() => setEditPerms(togglePerm(editPerms, p.key))}
                                                                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-all"
                                                                style={{
                                                                    background: editPerms.includes(p.key) ? '#1A1A1A' : 'white',
                                                                    color: editPerms.includes(p.key) ? '#C9A84C' : '#6B6355',
                                                                    borderColor: editPerms.includes(p.key) ? '#1A1A1A' : '#E5E0D8',
                                                                }}>
                                                                {p.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex justify-end">
                                                    <button onClick={() => handleUpdateMember(m.user_id)}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-xs font-semibold"
                                                        style={{ background: '#1A1A1A', color: '#FEFCF8' }}>
                                                        <Save size={12} /> Spara ändringar
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                            {members.length === 0 && (
                                <div className="px-6 py-10 text-center">
                                    <Users size={32} className="mx-auto mb-3" style={{ color: '#DDD8CE' }} />
                                    <p className="text-sm font-medium" style={{ color: '#6B6355' }}>Inga användare i denna organisation</p>
                                    <p className="text-xs mt-1" style={{ color: '#8A8178' }}>Klicka "Lägg till användare" för att bjuda in.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
                <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center gap-2" style={{ background: '#F7F3EC' }}>
                        <Settings size={16} style={{ color: '#C9A84C' }} /> Organisationsinställningar
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Organisationsnamn</label>
                            <input className="input-premium" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Slug (URL)</label>
                            <input className="input-premium" value={slug} onChange={(e) => setSlug(e.target.value)} />
                            <p className="text-xs text-muted-foreground">Unik identifierare, t.ex. "stockholm-kyrkan"</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Primärfärg</label>
                            <div className="flex gap-2">
                                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                                    className="w-10 h-10 rounded-lg cursor-pointer border border-border" />
                                <input className="input-premium flex-1" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Status</label>
                            <div className="flex items-center gap-3 pt-2">
                                <button type="button" onClick={() => setIsActive(!isActive)}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${isActive ? 'left-[22px]' : 'left-0.5'}`} />
                                </button>
                                <span className="text-sm font-medium" style={{ color: isActive ? '#22C55E' : '#EF4444' }}>
                                    {isActive ? 'Aktiv' : 'Inaktiv'}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Inaktiva organisationer kan inte loggas in i.</p>
                        </div>
                        <div className="md:col-span-2 flex justify-end pt-2">
                            <button onClick={handleSaveOrg} disabled={saving}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-60"
                                style={{ background: '#1A1A1A', color: '#FEFCF8' }}>
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Spara inställningar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
