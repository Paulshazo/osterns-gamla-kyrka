import { getISOWeek } from "date-fns"
import { toDateOnly, todayLocal } from "@/lib/payment-period"

const MONTHS_SV = [
    "Januari", "Februari", "Mars", "April", "Maj", "Juni",
    "Juli", "Augusti", "September", "Oktober", "November", "December",
]

type IncomeClient = {
    from: (table: string) => any
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
