"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { TrendingUp, TrendingDown, Wallet, Users, Users2 } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { useActiveOrg } from "@/hooks/useActiveOrg"

export default function Dashboard() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t } = useLanguage()
    const { activeOrgId } = useActiveOrg()
    const [stats, setStats] = useState({
        totalIncome: 0,
        totalExpenses: 0,
        familyCount: 0,
        memberCount: 0,
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!supabase || !activeOrgId) return
        const fetchStats = async () => {
            setLoading(true)
            const [
                { data: income },
                { data: expenses },
                { count: families },
                { data: adults },
                { count: children },
            ] = await Promise.all([
                supabase.from('intakter').select('total').eq('organisation_id', activeOrgId),
                supabase.from('utgifter').select('total').eq('organisation_id', activeOrgId),
                supabase.from('familjer').select('*', { count: 'exact', head: true }).eq('organisation_id', activeOrgId),
                supabase.from('familjer').select('make_namn, hustru_namn').eq('organisation_id', activeOrgId),
                supabase.from('barn').select('*', { count: 'exact', head: true }).eq('organisation_id', activeOrgId),
            ])

            const totalInc = income?.reduce((s, i) => s + (i.total ?? 0), 0) ?? 0
            const totalExp = expenses?.reduce((s, e) => s + (e.total ?? 0), 0) ?? 0

            // Count adults: each non-null make + hustru
            const adultCount = (adults ?? []).reduce((s, f) => {
                return s + (f.make_namn ? 1 : 0) + (f.hustru_namn ? 1 : 0)
            }, 0)

            setStats({
                totalIncome: totalInc,
                totalExpenses: totalExp,
                familyCount: families ?? 0,
                memberCount: adultCount + (children ?? 0),
            })
            setLoading(false)
        }
        fetchStats()
    }, [supabase, activeOrgId])

    const remaining = stats.totalIncome - stats.totalExpenses

    const cards = [
        {
            label: t('page.dashboard.total_income'),
            value: `${stats.totalIncome.toLocaleString('sv-SE')} kr`,
            sub: t('page.dashboard.from_all_sources'),
            icon: TrendingUp,
            color: '#2C7A4B',
            bg: '#D4EDDA',
        },
        {
            label: t('page.dashboard.total_expenses'),
            value: `${stats.totalExpenses.toLocaleString('sv-SE')} kr`,
            sub: t('page.dashboard.rent_bills'),
            icon: TrendingDown,
            color: '#C0392B',
            bg: '#F8D7DA',
        },
        {
            label: t('page.dashboard.net_balance'),
            value: `${remaining.toLocaleString('sv-SE')} kr`,
            sub: t('page.dashboard.cash_balance'),
            icon: Wallet,
            color: remaining >= 0 ? '#C9A84C' : '#C0392B',
            bg: remaining >= 0 ? '#FEF3C7' : '#F8D7DA',
        },
    ]

    return (
        <div>
            <div className="page-header">
                <h1 className="text-2xl font-bold tracking-tight">{t('page.dashboard.title')}</h1>
                <p className="text-muted-foreground text-sm mt-1">{t('page.dashboard.desc')}</p>
            </div>

            {/* Financial stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
                {cards.map(card => {
                    const Icon = card.icon
                    return (
                        <div key={card.label} className="stat-card card-lift">
                            <div className="flex items-start justify-between">
                                <div className="stat-label">{card.label}</div>
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ background: card.bg }}>
                                    <Icon size={18} style={{ color: card.color }} />
                                </div>
                            </div>
                            <div className="stat-value" style={{ color: card.color }}>
                                {loading ? (
                                    <div className="h-8 w-32 bg-secondary rounded animate-pulse mt-2" />
                                ) : card.value}
                            </div>
                            <div className="stat-sub">{card.sub}</div>
                        </div>
                    )
                })}
            </div>

            {/* Membership stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="stat-card card-lift">
                    <div className="flex items-start justify-between">
                        <div className="stat-label">{t('page.dashboard.registered_families')}</div>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: '#EDE8DF' }}>
                            <Users size={18} style={{ color: '#1A1A1A' }} />
                        </div>
                    </div>
                    <div className="stat-value">
                        {loading ? <div className="h-8 w-16 bg-secondary rounded animate-pulse mt-2" /> : stats.familyCount}
                    </div>
                    <div className="stat-sub">{t('page.dashboard.membership')}</div>
                </div>

                <div className="stat-card card-lift">
                    <div className="flex items-start justify-between">
                        <div className="stat-label">{t('page.dashboard.registered_members')}</div>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: '#EDE8DF' }}>
                            <Users2 size={18} style={{ color: '#1A1A1A' }} />
                        </div>
                    </div>
                    <div className="stat-value">
                        {loading ? <div className="h-8 w-16 bg-secondary rounded animate-pulse mt-2" /> : stats.memberCount}
                    </div>
                    <div className="stat-sub">
                        {`${stats.familyCount} ${t('page.dashboard.registered_families').toLowerCase()}`}
                    </div>
                </div>
            </div>

            {/* Net balance progress bar */}
            {!loading && stats.totalIncome > 0 && (
                <div className="stat-card mt-5">
                    <div className="flex items-center justify-between mb-3">
                        <div className="stat-label">
                            {remaining >= 0 ? '✓ Positiv kassabalans' : '⚠ Negativ kassabalans'}
                        </div>
                        <span className="text-sm font-bold" style={{ color: remaining >= 0 ? '#2C7A4B' : '#C0392B' }}>
                            {Math.round((1 - stats.totalExpenses / stats.totalIncome) * 100)}%
                        </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: '#EDE8DF' }}>
                        <div
                            className="h-full rounded-full transition-all"
                            style={{
                                width: `${Math.min(100, Math.max(0, (stats.totalExpenses / stats.totalIncome) * 100))}%`,
                                background: remaining >= 0
                                    ? 'linear-gradient(90deg, #2C7A4B, #48BB78)'
                                    : 'linear-gradient(90deg, #C0392B, #E57373)',
                            }}
                        />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>{t('page.dashboard.total_expenses')}: {stats.totalExpenses.toLocaleString('sv-SE')} kr</span>
                        <span>{t('page.dashboard.total_income')}: {stats.totalIncome.toLocaleString('sv-SE')} kr</span>
                    </div>
                </div>
            )}
        </div>
    )
}
