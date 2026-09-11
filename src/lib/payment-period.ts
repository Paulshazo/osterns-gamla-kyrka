import { addDays, addMonths, format, isAfter, parseISO, startOfDay } from "date-fns"
import { enUS, sv } from "date-fns/locale"
import { ageFromPersonnummer } from "@/lib/personnummer"

export const DEFAULT_ADULT_FEE = 200
export const DEFAULT_CHILD_FEE = 100

/** 100 kr under 18, 200 kr from 18. Returns null until the personal number can be parsed. */
export function monthlyFeeFromPersonnummer(pn: string | null | undefined): number | null {
    const age = ageFromPersonnummer(pn)
    if (age === null) return null
    return age < 18 ? DEFAULT_CHILD_FEE : DEFAULT_ADULT_FEE
}

export type FamilyFeeInput = {
    make_namn?: string | null
    hustru_namn?: string | null
    make_manads_avgift?: number | null
    hustru_manads_avgift?: number | null
    barn?: Array<{ namn?: string | null; manads_avgift?: number | null }>
}

export function familyMemberCounts(family: FamilyFeeInput) {
    const adults = (family.make_namn?.trim() ? 1 : 0) + (family.hustru_namn?.trim() ? 1 : 0)
    const children = (family.barn ?? []).filter(b => b.namn?.trim() || b.manads_avgift != null).length
    return { adults, children, total: adults + children }
}

export function familyMonthlyFee(family: FamilyFeeInput): number {
    const husband = family.make_namn?.trim()
        ? Number(family.make_manads_avgift ?? DEFAULT_ADULT_FEE)
        : 0
    const wife = family.hustru_namn?.trim()
        ? Number(family.hustru_manads_avgift ?? DEFAULT_ADULT_FEE)
        : 0
    const children = (family.barn ?? []).reduce(
        (sum, child) => sum + Number(child.manads_avgift ?? DEFAULT_CHILD_FEE),
        0,
    )
    return husband + wife + children
}

export function todayLocal(): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function toDateOnly(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
}

export function parseDateOnly(value: string | null | undefined): Date | null {
    if (!value) return null
    const parsed = parseISO(value)
    if (Number.isNaN(parsed.getTime())) return null
    return startOfDay(parsed)
}

export function coverageStartDate(previousUntil: Date | null, today = todayLocal()): Date {
    if (previousUntil && !isAfter(today, previousUntil)) return previousUntil
    return today
}

export function addAmountCoverage(start: Date, amount: number, monthlyFee: number): Date {
    if (monthlyFee <= 0 || amount <= 0) return start
    const monthsExact = amount / monthlyFee
    const wholeMonths = Math.floor(monthsExact + 1e-9)
    const fraction = monthsExact - wholeMonths
    const afterMonths = addMonths(start, wholeMonths)
    const daysInMonth = new Date(afterMonths.getFullYear(), afterMonths.getMonth() + 1, 0).getDate()
    return startOfDay(addDays(afterMonths, Math.round(fraction * daysInMonth)))
}

export type PaymentPeriod = {
    monthlyFee: number
    annualFee: number
    previousUntil: Date | null
    previousExpired: boolean
    start: Date
    validUntil: Date
    validUntilIso: string
    wholeMonths: number
    extraDays: number
    adults: number
    children: number
}

export function calculatePaymentPeriod(input: {
    amount: number
    monthlyFee: number
    previousUntil: string | null
    adults?: number
    children?: number
    today?: Date
}): PaymentPeriod {
    const monthlyFee = Math.max(0, Number(input.monthlyFee) || 0)
    const amount = Math.max(0, Number(input.amount) || 0)
    const today = startOfDay(input.today ?? todayLocal())
    const previousUntil = parseDateOnly(input.previousUntil)
    const previousExpired = Boolean(previousUntil && isAfter(today, previousUntil))
    const start = coverageStartDate(previousUntil, today)
    const monthsExact = monthlyFee > 0 ? amount / monthlyFee : 0
    const wholeMonths = Math.floor(monthsExact + 1e-9)
    const fraction = monthsExact - wholeMonths
    const afterMonths = addMonths(start, wholeMonths)
    const daysInMonth = new Date(afterMonths.getFullYear(), afterMonths.getMonth() + 1, 0).getDate()
    const extraDays = monthlyFee > 0 ? Math.round(fraction * daysInMonth) : 0
    const validUntil = startOfDay(addDays(afterMonths, extraDays))

    return {
        monthlyFee,
        annualFee: monthlyFee * 12,
        previousUntil,
        previousExpired,
        start,
        validUntil,
        validUntilIso: toDateOnly(validUntil),
        wholeMonths,
        extraDays,
        adults: input.adults ?? 0,
        children: input.children ?? 0,
    }
}

function formatCoverage(months: number, days: number, language: "sv" | "en"): string {
    const parts: string[] = []
    if (months > 0) {
        parts.push(language === "sv"
            ? `${months} mån`
            : `${months} mo`)
    }
    if (days > 0) {
        parts.push(language === "sv"
            ? `${days} ${days === 1 ? "dag" : "dagar"}`
            : `${days} ${days === 1 ? "day" : "days"}`)
    }
    if (parts.length === 0) {
        return language === "sv" ? "0 dagar" : "0 days"
    }
    return language === "sv" ? parts.join(" och ") : parts.join(" and ")
}

export function describePaymentPeriod(period: PaymentPeriod, language: "sv" | "en"): string {
    const loc = language === "sv" ? sv : enUS
    const fmt = (d: Date) => format(d, "d MMM yyyy", { locale: loc })
    const coverage = formatCoverage(period.wholeMonths, period.extraDays, language)
    const people = language === "sv"
        ? `${period.adults} vuxna + ${period.children} barn`
        : `${period.adults} adults + ${period.children} children`
    const fees = language === "sv"
        ? `Årsavgift ${period.annualFee.toLocaleString("sv-SE")} kr (${period.monthlyFee.toLocaleString("sv-SE")} kr/mån, ${people}).`
        : `Annual fee ${period.annualFee.toLocaleString("en-SE")} SEK (${period.monthlyFee.toLocaleString("en-SE")} SEK/month, ${people}).`

    let previous: string
    if (!period.previousUntil) {
        previous = language === "sv"
            ? "Ingen tidigare betalning — perioden räknas från idag."
            : "No previous payment — period starts today."
    } else if (period.previousExpired) {
        previous = language === "sv"
            ? `Tidigare giltig till ${fmt(period.previousUntil)} (förfallen). Ny period räknas från idag.`
            : `Previously valid until ${fmt(period.previousUntil)} (expired). New period starts today.`
    } else {
        previous = language === "sv"
            ? `Tidigare giltig till ${fmt(period.previousUntil)}. Ny betalning läggs på den perioden.`
            : `Previously valid until ${fmt(period.previousUntil)}. The new payment extends that period.`
    }

    const result = language === "sv"
        ? `Beloppet räcker i ${coverage} → ny giltighet ${fmt(period.validUntil)}.`
        : `This amount covers ${coverage} → new validity ${fmt(period.validUntil)}.`

    return `${fees} ${previous} ${result}`
}
