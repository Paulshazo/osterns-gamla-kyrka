"use client"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import {
    TrendingUp, TrendingDown, Wallet, Users, Users2,
    UserRound, Baby, GraduationCap, CheckCircle2, Clock, AlertCircle, MapPin,
} from "lucide-react"
import { addDays, isBefore, parseISO } from "date-fns"
import { useLanguage } from "@/components/language-provider"
import { useActiveOrg } from "@/hooks/useActiveOrg"
import { ageFromPersonnummer, ageGroupFromAge, sexFromPersonnummer } from "@/lib/personnummer"

type PlaceCount = { name: string; count: number }

type DashboardStats = {
    totalIncome: number
    totalExpenses: number
    familyCount: number
    memberCount: number
    adultCount: number
    youthCount: number
    childCount: number
    menCount: number
    womenCount: number
    paidCount: number
    soonCount: number
    overdueCount: number
    places: PlaceCount[]
}

const emptyStats: DashboardStats = {
    totalIncome: 0,
    totalExpenses: 0,
    familyCount: 0,
    memberCount: 0,
    adultCount: 0,
    youthCount: 0,
    childCount: 0,
    menCount: 0,
    womenCount: 0,
    paidCount: 0,
    soonCount: 0,
    overdueCount: 0,
    places: [],
}

function paymentBucket(paidUntil: string | null): 'paid' | 'soon' | 'overdue' {
    if (!paidUntil) return 'overdue'
    const today = new Date()
    const until = parseISO(paidUntil)
    if (isBefore(until, today)) return 'overdue'
    if (isBefore(until, addDays(today, 30))) return 'soon'
    return 'paid'
}

export default function Dashboard() {
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])
    const { t } = useLanguage()
    const { activeOrgId } = useActiveOrg()
    const [stats, setStats] = useState<DashboardStats>(emptyStats)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!supabase || !activeOrgId) return
        const fetchStats = async () => {
            setLoading(true)
            const [
                { data: income },
                { data: expenses },
                { data: families },
            ] = await Promise.all([
                supabase.from('intakter').select('total').eq('organisation_id', activeOrgId),
                supabase.from('utgifter').select('total').eq('organisation_id', activeOrgId),
                supabase
                    .from('familjer')
                    .select('make_namn, hustru_namn, make_personnummer, hustru_personnummer, ort, barn(personnummer), betalningar(betalat_till_datum, created_at)')
                    .eq('organisation_id', activeOrgId),
            ])

            const totalInc = income?.reduce((s, i) => s + (i.total ?? 0), 0) ?? 0
            const totalExp = expenses?.reduce((s, e) => s + (e.total ?? 0), 0) ?? 0

            let adultCount = 0
            let youthCount = 0
            let childCount = 0
            let menCount = 0
            let womenCount = 0
            let paidCount = 0
            let soonCount = 0
            let overdueCount = 0
            const placeMap = new Map<string, number>()

            const bumpGroup = (group: 'adult' | 'youth' | 'child') => {
                if (group === 'adult') adultCount += 1
                else if (group === 'youth') youthCount += 1
                else childCount += 1
            }

            for (const family of families ?? []) {
                const ort = (family.ort ?? '').trim()
                if (ort) placeMap.set(ort, (placeMap.get(ort) ?? 0) + 1)

                if (family.make_namn) {
                    bumpGroup(ageGroupFromAge(ageFromPersonnummer(family.make_personnummer), true))
                    const sex = sexFromPersonnummer(family.make_personnummer) ?? 'm'
                    if (sex === 'm') menCount += 1
                    else womenCount += 1
                }
                if (family.hustru_namn) {
                    bumpGroup(ageGroupFromAge(ageFromPersonnummer(family.hustru_personnummer), true))
                    const sex = sexFromPersonnummer(family.hustru_personnummer) ?? 'f'
                    if (sex === 'f') womenCount += 1
                    else menCount += 1
                }

                for (const child of family.barn ?? []) {
                    const age = ageFromPersonnummer(child.personnummer)
                    bumpGroup(ageGroupFromAge(age, false))
                    const sex = sexFromPersonnummer(child.personnummer)
                    if (sex === 'm') menCount += 1
                    else if (sex === 'f') womenCount += 1
                }

                const latest = (family.betalningar ?? [])
                    .slice()
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                const bucket = paymentBucket(latest?.betalat_till_datum ?? null)
                if (bucket === 'paid') paidCount += 1
                else if (bucket === 'soon') soonCount += 1
                else overdueCount += 1
            }

            const places = [...placeMap.entries()]
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)

            setStats({
                totalIncome: totalInc,
                totalExpenses: totalExp,
                familyCount: families?.length ?? 0,
                memberCount: adultCount + youthCount + childCount,
                adultCount,
                youthCount,
                childCount,
                menCount,
                womenCount,
                paidCount,
                soonCount,
                overdueCount,
                places,
            })
            setLoading(false)
        }
        fetchStats()
    }, [supabase, activeOrgId])

    const remaining = stats.totalIncome - stats.totalExpenses

    const moneyCards = [
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

    const memberCards = [
        {
            label: t('page.dashboard.registered_families'),
            value: stats.familyCount,
            sub: t('page.dashboard.families_sub'),
            icon: Users,
            color: '#1A1A1A',
            bg: '#EDE8DF',
        },
        {
            label: t('page.dashboard.registered_members'),
            value: stats.memberCount,
            sub: t('page.dashboard.members_sub'),
            icon: Users2,
            color: '#1A1A1A',
            bg: '#EDE8DF',
        },
        {
            label: t('page.dashboard.adults'),
            value: stats.adultCount,
            sub: t('page.dashboard.adults_sub'),
            icon: UserRound,
            color: '#1A1A1A',
            bg: '#EDE8DF',
        },
        {
            label: t('page.dashboard.youth'),
            value: stats.youthCount,
            sub: t('page.dashboard.youth_sub'),
            icon: GraduationCap,
            color: '#6D28D9',
            bg: '#EDE9FE',
        },
        {
            label: t('page.dashboard.children'),
            value: stats.childCount,
            sub: t('page.dashboard.children_sub'),
            icon: Baby,
            color: '#2980B9',
            bg: '#DBEAFE',
        },
    ]

    const feeCards = [
        {
            label: t('page.dashboard.paid'),
            value: stats.paidCount,
            icon: CheckCircle2,
            color: '#2C7A4B',
            bg: '#D4EDDA',
        },
        {
            label: t('page.dashboard.soon'),
            value: stats.soonCount,
            icon: Clock,
            color: '#B45309',
            bg: '#FEF3C7',
        },
        {
            label: t('page.dashboard.overdue'),
            value: stats.overdueCount,
            icon: AlertCircle,
            color: '#C0392B',
            bg: '#F8D7DA',
        },
    ]

    return (
        <div>
            <div className="page-header">
                <h1 className="text-2xl font-bold tracking-tight">{t('page.dashboard.title')}</h1>
                <p className="text-muted-foreground text-sm mt-1">{t('page.dashboard.desc')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
                {moneyCards.map(card => {
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
                                {loading ? <div className="h-8 w-32 bg-secondary rounded animate-pulse mt-2" /> : card.value}
                            </div>
                            <div className="stat-sub">{card.sub}</div>
                        </div>
                    )
                })}
            </div>

            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {t('page.dashboard.section_members')}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {memberCards.map(card => {
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
                                {loading ? <div className="h-8 w-16 bg-secondary rounded animate-pulse mt-2" /> : card.value}
                            </div>
                            <div className="stat-sub">{card.sub}</div>
                        </div>
                    )
                })}
            </div>

            <div className="stat-card card-lift mb-8">
                <div className="stat-label mb-4">{t('page.dashboard.men')} / {t('page.dashboard.women')}</div>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="stat-value">{loading ? '—' : stats.menCount}</div>
                        <div className="stat-sub">{t('page.dashboard.men')}</div>
                    </div>
                    <div>
                        <div className="stat-value">{loading ? '—' : stats.womenCount}</div>
                        <div className="stat-sub">{t('page.dashboard.women')}</div>
                    </div>
                </div>
                <div className="stat-sub mt-3">{t('page.dashboard.gender_sub')}</div>
            </div>

            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {t('page.dashboard.section_fees')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {feeCards.map(card => {
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
                                {loading ? <div className="h-8 w-16 bg-secondary rounded animate-pulse mt-2" /> : card.value}
                            </div>
                            <div className="stat-sub">
                                {stats.familyCount} {t('page.dashboard.registered_families').toLowerCase()}
                            </div>
                        </div>
                    )
                })}
            </div>

            {stats.places.length > 0 && (
                <>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        {t('page.dashboard.section_places')}
                    </h2>
                    <div className="stat-card mb-8">
                        <div className="space-y-3">
                            {stats.places.map(place => {
                                const max = stats.places[0]?.count || 1
                                return (
                                    <div key={place.name}>
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="font-medium flex items-center gap-2">
                                                <MapPin size={14} className="text-muted-foreground" />
                                                {place.name}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {place.count} {place.count === 1 ? t('page.dashboard.family_one') : t('page.dashboard.family_many')}
                                            </span>
                                        </div>
                                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EDE8DF' }}>
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${Math.round((place.count / max) * 100)}%`,
                                                    background: 'linear-gradient(90deg, #C9A84C, #8B6914)',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </>
            )}

            {!loading && stats.totalIncome > 0 && (
                <div className="stat-card">
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
