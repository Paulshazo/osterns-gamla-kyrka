"use client"

import { useLanguage } from "@/components/language-provider"
import { OrganisationDocumentsPanel } from "@/components/organisation-documents-panel"
import { useActiveOrg } from "@/hooks/useActiveOrg"
import { FileText, Loader2 } from "lucide-react"

export default function DokumentPage() {
    const { t } = useLanguage()
    const { activeOrgId, isOrgAdmin, isSuperAdmin, loading } = useActiveOrg()

    const canManage = isOrgAdmin || isSuperAdmin

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin" size={24} style={{ color: '#C9A84C' }} />
            </div>
        )
    }

    if (!activeOrgId) {
        return (
            <div className="text-center py-20 text-sm" style={{ color: '#8A8178' }}>
                {t('page.documents.no_org')}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                    <FileText size={26} style={{ color: '#C9A84C' }} />
                    {t('page.documents.title')}
                </h1>
                <p className="text-sm mt-1" style={{ color: '#8A8178' }}>
                    {t('page.documents.desc')}
                </p>
            </div>

            <OrganisationDocumentsPanel
                organisationId={activeOrgId}
                canManage={canManage}
            />
        </div>
    )
}
