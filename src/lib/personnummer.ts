/** Swedish personal identity number helpers. 12 digits YYYYMMDDNNNN, or 10 digits YYMMDDNNNN. */

function digitsOnly(value: string | null | undefined): string {
    return (value ?? '').replace(/\D/g, '')
}

export function birthDateFromPersonnummer(pn: string | null | undefined): Date | null {
    const d = digitsOnly(pn)
    let year: number
    let month: number
    let day: number

    if (d.length === 12) {
        year = Number(d.slice(0, 4))
        month = Number(d.slice(4, 6))
        day = Number(d.slice(6, 8))
    } else if (d.length === 10) {
        const yy = Number(d.slice(0, 2))
        month = Number(d.slice(2, 4))
        day = Number(d.slice(4, 6))
        const currentYy = new Date().getFullYear() % 100
        year = (yy > currentYy ? 1900 : 2000) + yy
    } else {
        return null
    }

    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
    return date
}

export function ageFromPersonnummer(pn: string | null | undefined, now = new Date()): number | null {
    const birth = birthDateFromPersonnummer(pn)
    if (!birth) return null
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1
    if (age < 0 || age > 120) return null
    return age
}

export function sexFromPersonnummer(pn: string | null | undefined): 'm' | 'f' | null {
    const d = digitsOnly(pn)
    if (d.length === 12) {
        const digit = Number(d[10])
        if (Number.isNaN(digit)) return null
        return digit % 2 === 1 ? 'm' : 'f'
    }
    if (d.length === 10) {
        const digit = Number(d[8])
        if (Number.isNaN(digit)) return null
        return digit % 2 === 1 ? 'm' : 'f'
    }
    return null
}

export type AgeGroup = 'adult' | 'youth' | 'child'

/** Barn 0–12, ungdomar 13–17, vuxna 18+. Parents always count as adults. */
export function ageGroupFromAge(age: number | null, isParent: boolean): AgeGroup {
    if (isParent) return 'adult'
    if (age === null) return 'child'
    if (age >= 18) return 'adult'
    if (age >= 13) return 'youth'
    return 'child'
}
