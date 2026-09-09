export type ProfileRole = 'superadmin' | 'admin' | 'user'
export type Department = 'register' | 'payments' | 'income' | 'expenses' | 'stats'

export const DEPARTMENTS: { id: Department; labelSv: string; labelEn: string }[] = [
    { id: 'register', labelSv: 'Familjeregister', labelEn: 'Family register' },
    { id: 'payments', labelSv: 'Betalningar', labelEn: 'Payments' },
    { id: 'income', labelSv: 'Intäkter', labelEn: 'Income' },
    { id: 'expenses', labelSv: 'Utgifter', labelEn: 'Expenses' },
    { id: 'stats', labelSv: 'Statistik', labelEn: 'Statistics' },
]
