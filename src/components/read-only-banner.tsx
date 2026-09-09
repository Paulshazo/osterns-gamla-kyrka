"use client"

import { Eye } from "lucide-react"
import { useLanguage } from "@/components/language-provider"

export function ReadOnlyBanner() {
    const { language } = useLanguage()
    return (
        <div
            className="mb-5 flex items-start gap-3 rounded-[12px] border px-4 py-3 text-sm"
            style={{ background: '#F7F3EC', borderColor: '#E0D8CC', color: '#6B6355' }}
        >
            <Eye size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#C9A84C' }} />
            <p>
                {language === 'sv'
                    ? 'Du kan se denna avdelning men inte redigera. Kontakta en administratör om du behöver behörighet.'
                    : 'You can view this section but not edit it. Contact an administrator if you need access.'}
            </p>
        </div>
    )
}
