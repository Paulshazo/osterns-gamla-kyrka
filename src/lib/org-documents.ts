export const ORG_DOCUMENTS_BUCKET = 'org_documents'
export const ORG_DOCUMENTS_MAX_BYTES = 20 * 1024 * 1024

export function sanitizeOrganisationFileName(name: string) {
    const base = name.replace(/[^a-zA-Z0-9._-åäöÅÄÖ\s]/g, '_').trim() || 'fil'
    return base.slice(0, 180)
}

export function buildOrganisationDocumentPath(orgId: string, documentId: string, fileName: string) {
    return `${orgId}/${documentId}/${sanitizeOrganisationFileName(fileName)}`
}

export function formatDocumentSize(bytes: number | null | undefined, language: 'sv' | 'en') {
    if (bytes == null || bytes <= 0) return '—'
    const units = language === 'sv'
        ? ['B', 'KB', 'MB', 'GB']
        : ['B', 'KB', 'MB', 'GB']
    let n = bytes
    let i = 0
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024
        i++
    }
    return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}
