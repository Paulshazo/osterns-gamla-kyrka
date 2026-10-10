const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SKIP_KEYS = new Set([
    'id',
    'user_id',
    'familj_id',
    'organisation_id',
    'betalning_id',
    'storage_path',
    'slug',
    'resend_api_key',
])

const RESOURCE_LABEL: Record<string, { sv: string; en: string }> = {
    payment: { sv: 'Betalning', en: 'Payment' },
    payment_status: { sv: 'Betalstatus', en: 'Payment status' },
    income: { sv: 'Intäkt', en: 'Income' },
    expense: { sv: 'Utgift', en: 'Expense' },
    family: { sv: 'Familj', en: 'Family' },
    settings: { sv: 'Inställningar', en: 'Settings' },
    auth: { sv: 'Konto', en: 'Account' },
    user: { sv: 'Användare', en: 'User' },
    document: { sv: 'Dokument', en: 'Document' },
    organisation: { sv: 'Organisation', en: 'Organisation' },
    organisation_member: { sv: 'Medlem', en: 'Member' },
    member_mail: { sv: 'Utskick', en: 'Mailing' },
}

const FIELD_LABEL: Record<string, { sv: string; en: string }> = {
    familje_namn: { sv: 'familj', en: 'family' },
    summan: { sv: 'belopp', en: 'amount' },
    total: { sv: 'belopp', en: 'amount' },
    betalat_via: { sv: 'via', en: 'via' },
    betalat_till_datum: { sv: 'betalat till', en: 'paid until' },
    email: { sv: 'e-post', en: 'email' },
    role: { sv: 'roll', en: 'role' },
    admin_title: { sv: 'titel', en: 'title' },
    login_title: { sv: 'inloggningstitel', en: 'login title' },
    resend_from_email: { sv: 'avsändare', en: 'sender' },
    resend_from_name: { sv: 'avsändarnamn', en: 'sender name' },
    file_name: { sv: 'fil', en: 'file' },
    name: { sv: 'namn', en: 'name' },
    manad: { sv: 'månad', en: 'month' },
    hyra: { sv: 'hyra', en: 'rent' },
    frukost: { sv: 'frukost', en: 'breakfast' },
    rakning: { sv: 'räkningar', en: 'bills' },
    gavor: { sv: 'gåvor', en: 'gifts' },
    ungdomar: { sv: 'ungdomar', en: 'youth' },
    medlems_avgift: { sv: 'medlemsavgift', en: 'membership fee' },
    annat: { sv: 'annat', en: 'other' },
    kommentar: { sv: 'beskrivning', en: 'description' },
    manuell_obetald: { sv: 'status', en: 'status' },
    manuell_betalat_till: { sv: 'betalat till', en: 'paid until' },
}

type Lang = 'sv' | 'en'

function isUuid(value: unknown): boolean {
    return typeof value === 'string' && UUID_RE.test(value.trim())
}

function asRecord(details: unknown): Record<string, unknown> {
    if (!details) return {}
    if (typeof details === 'string') {
        try {
            const parsed = JSON.parse(details)
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        } catch {
            return {}
        }
    }
    if (typeof details === 'object' && !Array.isArray(details)) {
        return details as Record<string, unknown>
    }
    return {}
}

function money(value: unknown): string | null {
    const amount = Number(value)
    if (!Number.isFinite(amount) || amount === 0) return null
    return `${amount.toLocaleString('sv-SE')} kr`
}

function fieldLabel(key: string, language: Lang): string {
    return FIELD_LABEL[key]?.[language] ?? key.replaceAll('_', ' ')
}

function formatValue(key: string, value: unknown, language: Lang): string | null {
    if (value == null || value === '') return null
    if (isUuid(value)) return null
    if (key === 'manuell_obetald') {
        return value ? (language === 'sv' ? 'obetald' : 'unpaid') : (language === 'sv' ? 'betald' : 'paid')
    }
    if (['summan', 'total', 'hyra', 'frukost', 'rakning', 'gavor', 'ungdomar', 'medlems_avgift', 'annat'].includes(key)) {
        return money(value)
    }
    if (typeof value === 'boolean') {
        return value ? (language === 'sv' ? 'ja' : 'yes') : (language === 'sv' ? 'nej' : 'no')
    }
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return value
    return null
}

function categoryParts(details: Record<string, unknown>, language: Lang): string[] {
    const keys = ['hyra', 'frukost', 'rakning', 'gavor', 'ungdomar', 'medlems_avgift', 'annat'] as const
    return keys
        .map(key => {
            const amount = money(details[key])
            return amount ? `${fieldLabel(key, language)} ${amount}` : null
        })
        .filter((part): part is string => Boolean(part))
}

export function formatAuditResource(resource: string | null | undefined, language: string): string {
    if (!resource) return '—'
    const lang: Lang = language === 'en' ? 'en' : 'sv'
    return RESOURCE_LABEL[resource]?.[lang] ?? resource
}

export function formatAuditDetails(input: {
    action: string
    resource?: string | null
    details?: unknown
    language: string
}): string {
    const language: Lang = input.language === 'en' ? 'en' : 'sv'
    const details = asRecord(input.details)
    const resource = input.resource ?? ''
    const family = typeof details.familje_namn === 'string' ? details.familje_namn : null
    const amount = money(details.summan ?? details.total)
    const via = typeof details.betalat_via === 'string' ? details.betalat_via : null
    const email = typeof details.email === 'string' ? details.email : null
    const fileName = typeof details.file_name === 'string' ? details.file_name : null
    const month = typeof details.manad === 'string' ? details.manad : null
    const comment = typeof details.kommentar === 'string' ? details.kommentar : null
    const categories = categoryParts(details, language)

    if (resource === 'auth' && input.action === 'login') {
        return language === 'sv' ? 'Loggade in i registret' : 'Signed in'
    }
    if (resource === 'auth' && input.action === 'logout') {
        return language === 'sv' ? 'Loggade ut' : 'Signed out'
    }
    if (resource === 'auth' && input.action === 'password_changed') {
        return language === 'sv' ? 'Bytte lösenord' : 'Changed password'
    }

    if (resource === 'payment') {
        const parts = [
            amount ? (language === 'sv' ? `betalning på ${amount}` : `payment of ${amount}`) : (language === 'sv' ? 'betalning' : 'payment'),
            family ? (language === 'sv' ? `för familjen ${family}` : `for family ${family}`) : null,
            via ? `${language === 'sv' ? 'via' : 'via'} ${via}` : null,
            typeof details.betalat_till_datum === 'string'
                ? (language === 'sv' ? `giltig till ${details.betalat_till_datum}` : `valid until ${details.betalat_till_datum}`)
                : null,
        ].filter(Boolean)
        const verb = input.action === 'update'
            ? (language === 'sv' ? 'Uppdaterade' : 'Updated')
            : input.action === 'delete'
                ? (language === 'sv' ? 'Raderade' : 'Deleted')
                : (language === 'sv' ? 'Registrerade' : 'Registered')
        return `${verb} ${parts.join(' ')}`
    }

    if (resource === 'payment_status') {
        const unpaid = Boolean(details.manuell_obetald)
        const until = typeof details.manuell_betalat_till === 'string' ? details.manuell_betalat_till : null
        const who = family ? (language === 'sv' ? `familjen ${family}` : `family ${family}`) : (language === 'sv' ? 'familjen' : 'the family')
        if (unpaid) {
            return language === 'sv' ? `Satte ${who} till obetald` : `Marked ${who} as unpaid`
        }
        if (until) {
            return language === 'sv' ? `Ändrade betalat till ${until} för ${who}` : `Set paid-until ${until} for ${who}`
        }
        return language === 'sv' ? `Ändrade betalstatus för ${who}` : `Changed payment status for ${who}`
    }

    if (resource === 'income' || resource === 'expense') {
        const kind = resource === 'income'
            ? (language === 'sv' ? 'intäkt' : 'income')
            : (language === 'sv' ? 'utgift' : 'expense')
        const verb = input.action === 'update'
            ? (language === 'sv' ? 'Uppdaterade' : 'Updated')
            : input.action === 'delete'
                ? (language === 'sv' ? 'Raderade' : 'Deleted')
                : (language === 'sv' ? 'Registrerade' : 'Registered')
        const extras = [
            amount ? `${language === 'sv' ? 'på' : 'of'} ${amount}` : null,
            categories.length ? `(${categories.join(', ')})` : null,
            month ? `${language === 'sv' ? 'i' : 'in'} ${month}` : null,
            comment,
        ].filter(Boolean)
        return `${verb} ${kind}${extras.length ? ` ${extras.join(' ')}` : ''}`
    }

    if (resource === 'family') {
        const who = family ? (language === 'sv' ? `familjen ${family}` : `family ${family}`) : (language === 'sv' ? 'en familj' : 'a family')
        if (input.action === 'delete') return language === 'sv' ? `Raderade ${who}` : `Deleted ${who}`
        if (input.action === 'update') return language === 'sv' ? `Uppdaterade ${who}` : `Updated ${who}`
        return language === 'sv' ? `Lade till ${who}` : `Added ${who}`
    }

    if (resource === 'user') {
        const role = typeof details.role === 'string' ? details.role : null
        const who = email ?? (language === 'sv' ? 'en användare' : 'a user')
        const roleText = role ? ` (${role})` : ''
        if (input.action === 'delete') return language === 'sv' ? `Raderade användaren ${who}${roleText}` : `Deleted user ${who}${roleText}`
        return language === 'sv' ? `Lade till användaren ${who}${roleText}` : `Added user ${who}${roleText}`
    }

    if (resource === 'document') {
        const file = fileName ?? (language === 'sv' ? 'ett dokument' : 'a document')
        return input.action === 'delete'
            ? (language === 'sv' ? `Raderade dokumentet ${file}` : `Deleted document ${file}`)
            : (language === 'sv' ? `Laddade upp ${file}` : `Uploaded ${file}`)
    }

    if (resource === 'settings') {
        const bits = ['admin_title', 'login_title', 'resend_from_email', 'resend_from_name']
            .map(key => {
                const value = formatValue(key, details[key], language)
                return value ? `${fieldLabel(key, language)} ${value}` : null
            })
            .filter(Boolean)
        return bits.length
            ? (language === 'sv' ? `Uppdaterade inställningar: ${bits.join(', ')}` : `Updated settings: ${bits.join(', ')}`)
            : (language === 'sv' ? 'Uppdaterade inställningar' : 'Updated settings')
    }

    if (resource === 'member_mail') {
        const count = Number(details.recipient_count)
        const subject = typeof details.subject === 'string' ? details.subject : null
        const countText = Number.isFinite(count) && count > 0
            ? (language === 'sv' ? `${count} medlemmar` : `${count} members`)
            : (language === 'sv' ? 'medlemmar' : 'members')
        if (subject) {
            return language === 'sv'
                ? `Skickade utskick till ${countText}: ${subject}`
                : `Sent mailing to ${countText}: ${subject}`
        }
        if (details.type === 'reminder') {
            return language === 'sv' ? 'Skickade betalningspåminnelse' : 'Sent payment reminder'
        }
        if (details.type === 'receipt') {
            return language === 'sv' ? 'Skickade kvitto' : 'Sent receipt'
        }
        return language === 'sv' ? `Skickade utskick till ${countText}` : `Sent mailing to ${countText}`
    }

    if (resource === 'organisation') {
        const name = typeof details.name === 'string' ? details.name : null
        if (input.action === 'delete') return language === 'sv' ? `Raderade organisationen${name ? ` ${name}` : ''}` : `Deleted organisation${name ? ` ${name}` : ''}`
        if (input.action === 'update') return language === 'sv' ? `Uppdaterade organisationen${name ? ` ${name}` : ''}` : `Updated organisation${name ? ` ${name}` : ''}`
        return language === 'sv' ? `Skapade organisationen${name ? ` ${name}` : ''}` : `Created organisation${name ? ` ${name}` : ''}`
    }

    const leftovers = Object.entries(details)
        .filter(([key]) => !SKIP_KEYS.has(key) && key !== 'familje_namn')
        .map(([key, value]) => {
            const formatted = formatValue(key, value, language)
            return formatted ? `${fieldLabel(key, language)}: ${formatted}` : null
        })
        .filter((part): part is string => Boolean(part))

    if (family && leftovers.length) return `${family}. ${leftovers.join(', ')}`
    if (family) return family
    if (leftovers.length) return leftovers.join(', ')
    return '—'
}
