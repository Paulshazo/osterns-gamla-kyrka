import { getISOWeek } from "date-fns"
import { toDateOnly, todayLocal } from "@/lib/payment-period"

const MONTHS_SV = [
    "Januari", "Februari", "Mars", "April", "Maj", "Juni",
    "Juli", "Augusti", "September", "Oktober", "November", "December",
]

type IncomeClient = {
    from: (table: string) => any
    rpc?: (fn: string, args: Record<string, unknown>) => any
}

function incomeRow(input: {
    organisationId: string
    amount: number
    familyName: string
    date?: Date
}) {
    const date = input.date ?? todayLocal()
    return {
        organisation_id: input.organisationId,
        datum: toDateOnly(date),
        manad: MONTHS_SV[date.getMonth()],
        vecka: getISOWeek(date),
        medlems_avgift: input.amount,
        gavor: 0,
        ungdomar: 0,
        annat: 0,
        total: input.amount,
        rapporterat_av: `Medlemsavgift — ${input.familyName}`,
    }
}

/** Writes the membership payment as an income row. Never throws — payment save must still succeed. */
export async function syncPaymentToIncome(
    supabase: IncomeClient,
    input: {
        organisationId: string | null
        paymentId: string | null
        amount: number
        familyName: string
        isNew: boolean
    },
) {
    if (!input.organisationId || !input.paymentId || !(input.amount > 0)) return
    const row = incomeRow({
        organisationId: input.organisationId,
        amount: input.amount,
        familyName: input.familyName.trim() || "Familj",
    })

    const withLink = await supabase.from("intakter").upsert(
        { ...row, betalning_id: input.paymentId },
        { onConflict: "betalning_id" },
    )
    if (!withLink.error) return

    const missingLink = /betalning_id|schema cache|column/i.test(withLink.error.message ?? "")
    if (!missingLink) {
        console.warn("Kunde inte spara medlemsavgift som intäkt:", withLink.error.message)
        return
    }

    if (!input.isNew) return

    const { error } = await supabase.from("intakter").insert([row])
    if (error) console.warn("Kunde inte spara medlemsavgift som intäkt:", error.message)
}

const MEMBERSHIP_PREFIX = "Medlemsavgift — "

function isMissingColumnError(message?: string) {
    return /betalning_id|schema cache|column/i.test(message ?? "")
}

async function findLinkedPaymentId(
    supabase: IncomeClient,
    income: {
        organisation_id?: string | null
        betalning_id?: string | null
        rapporterat_av?: string | null
        medlems_avgift?: number | null
        total?: number | null
    },
): Promise<string | null> {
    if (income.betalning_id) return income.betalning_id

    const reported = (income.rapporterat_av ?? "").trim()
    if (!reported.startsWith(MEMBERSHIP_PREFIX) || !income.organisation_id) return null

    const familyName = reported.slice(MEMBERSHIP_PREFIX.length).trim()
    if (!familyName) return null

    const amount = Number(income.medlems_avgift) || Number(income.total) || 0
    const { data: family } = await supabase
        .from("familjer")
        .select("id")
        .eq("organisation_id", income.organisation_id)
        .eq("familje_namn", familyName)
        .maybeSingle()

    if (!family?.id) return null

    let query = supabase
        .from("betalningar")
        .select("id")
        .eq("familj_id", family.id)

    if (amount > 0) query = query.eq("summan", amount)

    const { data: payments } = await query
        .order("betalat_till_datum", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
    return payments?.[0]?.id ?? null
}

/** Deletes an income row and, for membership fees, the linked payment so family status reverts. */
export async function deleteIncomeAndLinkedPayment(
    supabase: IncomeClient,
    income: {
        id: string
        organisation_id?: string | null
        betalning_id?: string | null
        rapporterat_av?: string | null
        medlems_avgift?: number | null
        total?: number | null
    },
): Promise<{ error: string | null }> {
    if (supabase.rpc) {
        const { error: rpcError } = await supabase.rpc("delete_income_entry", { p_income_id: income.id })
        if (!rpcError) return { error: null }
    }

    const paymentId = await findLinkedPaymentId(supabase, income)
    if (paymentId) {
        const { error: paymentError } = await supabase.from("betalningar").delete().eq("id", paymentId)
        if (paymentError && !isMissingColumnError(paymentError.message)) {
            return { error: paymentError.message }
        }
    }

    const { error: incomeError } = await supabase.from("intakter").delete().eq("id", income.id)
    if (incomeError && !/0 rows|not found|PGRST116/i.test(incomeError.message ?? "")) {
        return { error: incomeError.message }
    }
    return { error: null }
}
