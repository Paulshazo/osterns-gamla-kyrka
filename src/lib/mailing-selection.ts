export type MailingMode = "all" | "selected"

export function hasValidEmail(value: string | null | undefined) {
    return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
}

/** Everyone with a valid address, checked. Used when the user starts picking recipients. */
export function selectionForAllWithEmail(contacts: { id: string; mail: string | null }[]) {
    const next: Record<string, boolean> = {}
    for (const contact of contacts) {
        if (hasValidEmail(contact.mail)) next[contact.id] = true
    }
    return next
}

/**
 * "Alla med e-post" shows every valid address as checked, but that choice is not
 * stored until the user switches to picking individuals. Carry those checks over
 * so the list is not empty when they arrive.
 */
export function selectionAfterModeChange(
    mode: MailingMode,
    nextMode: MailingMode,
    contacts: { id: string; mail: string | null }[],
    selected: Record<string, boolean>,
) {
    if (nextMode === "selected" && mode === "all") {
        return selectionForAllWithEmail(contacts)
    }
    return selected
}

/** Unchecking one person in the all-selected list keeps everyone else selected. */
export function selectionAfterToggle(
    mode: MailingMode,
    contacts: { id: string; mail: string | null }[],
    selected: Record<string, boolean>,
    id: string,
) {
    const base = mode === "all" ? selectionForAllWithEmail(contacts) : selected
    return { ...base, [id]: !base[id] }
}
