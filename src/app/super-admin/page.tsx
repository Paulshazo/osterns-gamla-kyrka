"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import {
    Building2, Plus, Users, Loader2, CheckCircle, XCircle,
    Eye, ArrowRight, ScrollText, BarChart3, Trash2,
} from "lucide-react"
import { createOrganisation, setActiveOrganisation, deleteOrganisation, getOrgsWithMemberCount } from "@/app/actions/org"

interface Organisation {
    id: string
    name: string
    slug: string
    logo_url: string | null
    primary_color: string
    is_active: boolean
    created_at: string
    organisation_members: { count: number }[]
}

export default function SuperAdminPage() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])

    const [orgs, setOrgs] = useState<Organisation[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [totalUsers, setTotalUsers] = useState(0)
    const [totalFamilies, setTotalFamilies] = useState(0)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const [newName, setNewName] = useState("")
    const [newSlug, setNewSlug] = useState("")
    const [newColor, setNewColor] = useState("#C9A84C")

    const fetchOrgs = async () => {
        if (!supabase) return
        try {
            const { data } = await supabase
                .from('organisations')
                .select('*')
                .order('created_at', { ascending: false })

            // Fetch member counts via server action
            const orgsWithCount = await getOrgsWithMemberCount()
            setOrgs(orgsWithCount ?? data ?? [])

            // Global stats
            const { count: usersCount } = await supabase.from('user_profiles').select('id', { count: 'exact', head: true })
            setTotalUsers(usersCount ?? 0)
            const { count: famCount } = await supabase.from('familjer').select('id', { count: 'exact', head: true })
            setTotalFamilies(famCount ?? 0)
        } catch { /* ignore */ }
        setLoading(false)
    }

    useEffect(() => { fetchOrgs() }, [supabase])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)
        setError(null)
        try {
            const formData = new FormData()
            formData.set('name', newName)
            formData.set('slug', newSlug || newName.toLowerCase().replace(/[^a-z0-9]/g, '-'))
            formData.set('primary_color', newColor)
            const result = await createOrganisation(formData)
            if (!result.success) throw new Error(result.error)
            setSuccess(`Organisation "${newName}" skapad!`)
            setShowCreate(false)
            setNewName(""); setNewSlug(""); setNewColor("#C9A84C")
            await fetchOrgs()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (orgId: string, orgName: string) => {
        if (!confirm(`Är du säker att du vill radera "${orgName}"? Detta kan inte ångras.`)) return
        setDeletingId(orgId)
        try {
            const result = await deleteOrganisation(orgId)
            if (!result.success) throw new Error(result.error)
            setSuccess(`"${orgName}" raderad.`)
            await fetchOrgs()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setDeletingId(null)
        }
    }

    const handleImpersonate = async (orgId: string) => {
        await setActiveOrganisation(orgId)
        window.location.href = "/"
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin" size={24} style={{ color: '#C9A84C' }} />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Global stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Organisationer', value: orgs.length, icon: Building2, color: '#C9A84C' },
                    { label: 'Totala användare', value: totalUsers, icon: Users, color: '#6366F1' },
                    { label: 'Totala familjer', value: totalFamilies, icon: Users, color: '#22C55E' },
                    { label: 'Aktiva orgs', value: orgs.filter(o => o.is_active).length, icon: CheckCircle, color: '#22C55E' },
                ].map(s => (
                    <div key={s.label} className="bg-card border border-border rounded-[14px] p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <s.icon size={16} style={{ color: s.color }} />
                            <span className="text-xs font-medium" style={{ color: '#8A8178' }}>{s.label}</span>
                        </div>
                        <span className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>{s.value}</span>
                    </div>
                ))}
            </div>

            {/* Header + Create button */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>Organisationer</h2>
                    <p className="text-sm mt-1" style={{ color: '#6B6355' }}>Hantera alla organisationer, användare och data</p>
                </div>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-sm font-semibold transition-all"
                    style={{ background: '#1A1A1A', color: '#FEFCF8' }}>
                    <Plus size={16} /> Ny organisation
                </button>
            </div>

            {error && <div className="p-4 rounded-[10px] border text-sm bg-red-50 text-red-700 border-red-200">{error}</div>}
            {success && <div className="p-4 rounded-[10px] border text-sm bg-green-50 text-green-700 border-green-200">{success}</div>}

            {/* Create form */}
            {showCreate && (
                <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center gap-2" style={{ background: '#F7F3EC' }}>
                        <Plus size={16} style={{ color: '#C9A84C' }} />
                        Skapa ny organisation
                    </div>
                    <form onSubmit={handleCreate} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Namn *</label>
                            <input className="input-premium" value={newName}
                                onChange={(e) => {
                                    setNewName(e.target.value)
                                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9åäö]/g, '-').replace(/-+/g, '-'))
                                }}
                                placeholder="Stockholm Kyrkan" required />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Slug (URL) *</label>
                            <input className="input-premium" value={newSlug}
                                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                                placeholder="stockholm-kyrkan" required />
                            <p className="text-xs text-muted-foreground">Unik identifierare i URL:er</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold">Primärfärg</label>
                            <div className="flex gap-2">
                                <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                                    className="w-10 h-10 rounded-lg cursor-pointer border border-border" />
                                <input className="input-premium flex-1" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
                            </div>
                        </div>
                        <div className="md:col-span-3 flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setShowCreate(false)}
                                className="px-4 py-2 rounded-[10px] text-sm font-medium" style={{ color: '#6B6355' }}>
                                Avbryt
                            </button>
                            <button type="submit" disabled={creating}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-60"
                                style={{ background: '#1A1A1A', color: '#FEFCF8' }}>
                                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                Skapa organisation
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Org list */}
            <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-border font-semibold text-sm flex items-center gap-2" style={{ background: '#F7F3EC' }}>
                    <Building2 size={16} style={{ color: '#C9A84C' }} />
                    Alla organisationer ({orgs.length})
                </div>
                <div className="divide-y divide-border">
                    {orgs.map((org) => {
                        const memberCount = org.organisation_members?.[0]?.count ?? 0
                        return (
                            <div key={org.id} className="flex items-center gap-4 px-6 py-4 hover:bg-black/[0.02] transition-colors">
                                {/* Logo */}
                                {org.logo_url ? (
                                    <img src={org.logo_url} alt={org.name} className="w-11 h-11 rounded-xl object-contain flex-shrink-0" />
                                ) : (
                                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                        style={{ background: org.primary_color || '#C9A84C' }}>
                                        {org.name.substring(0, 2).toUpperCase()}
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-sm truncate" style={{ color: '#1A1A1A' }}>{org.name}</h3>
                                        {org.is_active ? (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Aktiv</span>
                                        ) : (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Inaktiv</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 mt-0.5 text-xs" style={{ color: '#8A8178' }}>
                                        <span>/{org.slug}</span>
                                        <span className="flex items-center gap-1"><Users size={10} /> {memberCount} användare</span>
                                        <span>{new Date(org.created_at).toLocaleDateString('sv-SE')}</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button onClick={() => handleImpersonate(org.id)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-medium transition-all hover:shadow-sm"
                                        style={{ background: '#F7F3EC', color: '#1A1A1A' }}
                                        title="Logga in som denna org">
                                        <Eye size={12} /> Visa
                                    </button>
                                    <a href={`/super-admin/${org.id}`}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-medium transition-all hover:shadow-sm"
                                        style={{ background: '#1A1A1A', color: '#C9A84C' }}>
                                        Hantera <ArrowRight size={12} />
                                    </a>
                                    <button onClick={() => handleDelete(org.id, org.name)}
                                        disabled={deletingId === org.id}
                                        className="p-2 rounded-[8px] text-xs transition-all hover:bg-red-50 disabled:opacity-50"
                                        title="Radera organisation">
                                        {deletingId === org.id
                                            ? <Loader2 size={13} className="animate-spin text-red-500" />
                                            : <Trash2 size={13} className="text-red-400" />}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                    {orgs.length === 0 && (
                        <div className="text-center py-16">
                            <Building2 size={48} className="mx-auto mb-4" style={{ color: '#DDD8CE' }} />
                            <p className="font-semibold" style={{ color: '#6B6355' }}>Inga organisationer ännu</p>
                            <p className="text-sm mt-1" style={{ color: '#8A8178' }}>Klicka "Ny organisation" ovan för att komma igång.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
