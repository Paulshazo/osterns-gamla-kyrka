"use server"

import { createClient } from "@/utils/supabase/server"
import { getActiveOrgId } from "@/app/actions/org"

// --------------------------------------------------------
// Get Resend config from app_settings (per organisation)
// --------------------------------------------------------
async function getOrgSettings() {
    const supabase = await createClient()
    const orgId = await getActiveOrgId()
    let query = supabase
        .from('app_settings')
        .select('resend_api_key, resend_from_email, resend_from_name, admin_title')
    query = orgId ? query.eq('organisation_id', orgId) : query.eq('id', 1)
    const { data } = await query.maybeSingle()
    return data
}

async function getResendConfig() {
    const data = await getOrgSettings()

    if (!data?.resend_api_key || !data?.resend_from_email) {
        throw new Error('Resend är inte konfigurerat. Gå till Inställningar och lägg in din Resend API-nyckel.')
    }

    return {
        apiKey: data.resend_api_key,
        fromEmail: data.resend_from_email,
        from: `${data.resend_from_name ?? 'Kyrkoregistret'} <${data.resend_from_email}>`,
        orgName: data.admin_title ?? 'Kyrkoregistret',
    }
}

function inboxHeaders() {
    return {
        Importance: 'high',
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        Priority: 'urgent',
    }
}

async function sendResendEmail(cfg: Awaited<ReturnType<typeof getResendConfig>>, payload: {
    to: string
    subject: string
    html: string
    text: string
}) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: cfg.from,
            to: [payload.to],
            reply_to: cfg.fromEmail,
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
            headers: inboxHeaders(),
        }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Resend API error')
    }
    return res.json()
}

// --------------------------------------------------------
// Log audit event helper
// --------------------------------------------------------
async function logEvent(action: string, resource: string, resourceId: string, details: object = {}) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase.from('audit_logs').insert({
            user_id: user.id,
            user_email: user.email,
            action,
            resource,
            resource_id: resourceId,
            details,
        })
    } catch { /* fire and forget */ }
}

// --------------------------------------------------------
// Generate HTML for payment receipt
// --------------------------------------------------------
function buildReceiptHTML(params: {
    familyName: string
    makeNamn: string
    hustru_namn: string | null
    amount: number
    paidVia: string
    validUntil: string
    reference: string | null
    date: string
    orgName: string
}): string {
    return `
<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #F7F3EC; margin: 0; padding: 40px 20px; }
  .container { max-width: 560px; margin: 0 auto; background: #FEFCF8; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 100%); padding: 32px 36px; }
  .header h1 { color: #C9A84C; font-size: 22px; margin: 0 0 4px; letter-spacing: -0.5px; }
  .header p { color: #A09080; font-size: 13px; margin: 0; }
  .gold-bar { height: 4px; background: linear-gradient(90deg, #C9A84C 0%, #8B6914 100%); }
  .body { padding: 32px 36px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #A09080; margin-bottom: 12px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #EDE8DF; }
  .row:last-child { border-bottom: none; }
  .row .label { color: #6B6355; font-size: 13px; }
  .row .value { color: #1A1A1A; font-size: 13px; font-weight: 600; text-align: right; }
  .amount-box { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 100%); border-radius: 12px; padding: 20px 24px; margin: 24px 0; }
  .amount-box .amount-label { color: #A09080; font-size: 12px; margin-bottom: 4px; }
  .amount-box .amount { color: #C9A84C; font-size: 32px; font-weight: 800; letter-spacing: -1px; }
  .amount-box .amount span { font-size: 16px; }
  .footer { background: #F7F3EC; padding: 20px 36px; text-align: center; }
  .footer p { color: #A09080; font-size: 11px; margin: 0; }
  .badge { display: inline-block; background: #D4EDDA; color: #1E6B3A; padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; margin-top: 8px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${params.orgName}</h1>
    <p>Betalningskvitto — ${params.date}</p>
  </div>
  <div class="gold-bar"></div>
  <div class="body">
    <div class="section-title">Familj</div>
    <div class="row">
      <span class="label">Familjenamn</span>
      <span class="value">${params.familyName}</span>
    </div>
    <div class="row">
      <span class="label">Make</span>
      <span class="value">${params.makeNamn}</span>
    </div>
    ${params.hustru_namn ? `
    <div class="row">
      <span class="label">Hustru</span>
      <span class="value">${params.hustru_namn}</span>
    </div>` : ''}

    <div class="amount-box">
      <div class="amount-label">Betalt belopp</div>
      <div class="amount">${params.amount.toLocaleString('sv-SE')} <span>kr</span></div>
    </div>

    <div class="section-title">Betalningsinfo</div>
    <div class="row">
      <span class="label">Betalt via</span>
      <span class="value">${params.paidVia}</span>
    </div>
    <div class="row">
      <span class="label">Giltig till</span>
      <span class="value">${params.validUntil}</span>
    </div>
    ${params.reference ? `
    <div class="row">
      <span class="label">Referens</span>
      <span class="value">${params.reference}</span>
    </div>` : ''}

    <div style="text-align:center; margin-top: 24px;">
      <span class="badge">✓ Betalning bekräftad</span>
    </div>
  </div>
  <div class="footer">
    <p>${params.orgName} &bull; Tack för din betalning!</p>
    <p style="margin-top:4px;">Detta är ett automatiskt genererat kvitto.</p>
  </div>
</div>
</body>
</html>`
}

// --------------------------------------------------------
// Send payment receipt
// --------------------------------------------------------
export async function sendPaymentReceiptAction(params: {
    recipientEmail: string
    recipientName: string
    familyName: string
    makeNamn: string
    hustru_namn: string | null
    amount: number
    paidVia: string
    validUntil: string
    reference: string | null
    betalningId: string
}) {
    try {
        const supabase = await createClient()
        const cfg = await getResendConfig()
        const orgName = cfg.orgName

        const date = new Date().toLocaleDateString('sv-SE')
        const subject = `Betalningskvitto — ${params.familyName} ${date}`
        const html = buildReceiptHTML({
            ...params,
            date,
            orgName,
        })
        const text = [
            `${orgName} — Betalningskvitto ${date}`,
            '',
            `Familj: ${params.familyName}`,
            `Make: ${params.makeNamn}`,
            params.hustru_namn ? `Hustru: ${params.hustru_namn}` : '',
            `Betalt belopp: ${params.amount.toLocaleString('sv-SE')} kr`,
            `Betalt via: ${params.paidVia}`,
            `Giltig till: ${params.validUntil}`,
            params.reference ? `Referens: ${params.reference}` : '',
            '',
            'Tack för din betalning.',
            'Detta är ett automatiskt genererat kvitto.',
        ].filter(Boolean).join('\n')

        const result = await sendResendEmail(cfg, {
            to: params.recipientEmail,
            subject,
            html,
            text,
        })

        // Log to email_receipts
        await supabase.from('email_receipts').insert({
            betalning_id: params.betalningId,
            recipient_email: params.recipientEmail,
            recipient_name: params.recipientName,
            subject,
            resend_message_id: result.id,
        })

        // Audit log
        await logEvent('email_sent', 'payment', params.betalningId, {
            to: params.recipientEmail,
            type: 'receipt',
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

// --------------------------------------------------------
// Send payment reminder
// --------------------------------------------------------
export async function sendPaymentReminderAction(params: {
    recipientEmail: string
    familyName: string
    makeNamn: string
    overdueDate: string
    familyId: string
}) {
    try {
        const supabase = await createClient()
        const cfg = await getResendConfig()
        const orgName = cfg.orgName

        const subject = `Påminnelse om medlemsavgift — ${params.familyName}`
        const html = `
<!DOCTYPE html>
<html lang="sv">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background: #F7F3EC; padding: 40px 20px; margin: 0; }
  .container { max-width: 520px; margin: 0 auto; background: #FEFCF8; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 100%); padding: 28px 32px; }
  .header h1 { color: #C9A84C; font-size: 20px; margin: 0; }
  .header p { color: #A09080; font-size: 13px; margin: 4px 0 0; }
  .body { padding: 28px 32px; }
  .alert { background: #FFF8EE; border: 1px solid #FCD34D; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
  .alert p { color: #78350F; font-size: 13px; margin: 0; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #EDE8DF; font-size: 13px; }
  .row .label { color: #6B6355; }
  .row .value { font-weight: 600; color: #1A1A1A; }
  .footer { background: #F7F3EC; padding: 16px 32px; text-align: center; font-size: 11px; color: #A09080; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Påminnelse om medlemsavgift</h1>
    <p>${orgName}</p>
  </div>
  <div class="body">
    <p style="color:#1A1A1A; font-size:15px; margin-bottom:20px;">
      Hej <strong>${params.makeNamn}</strong>,
    </p>
    <div class="alert">
      <p>Medlemsavgiften för familjen <strong>${params.familyName}</strong> har förfallit. Vänligen betala snarast möjligt.</p>
    </div>
    <div class="row">
      <span class="label">Familj</span>
      <span class="value">${params.familyName}</span>
    </div>
    <div class="row">
      <span class="label">Förfallet sedan</span>
      <span class="value">${params.overdueDate}</span>
    </div>
    <p style="color:#6B6355; font-size:13px; margin-top:20px;">
      Kontakta oss om du har frågor angående din betalning. Svara på detta mejl så kommer det till församlingen.
    </p>
  </div>
  <div class="footer">
    <p>${orgName}</p>
  </div>
</div>
</body>
</html>`
        const text = [
            `${orgName} — Påminnelse om medlemsavgift`,
            '',
            `Hej ${params.makeNamn},`,
            '',
            `Medlemsavgiften för familjen ${params.familyName} har förfallit.`,
            `Förfallet sedan: ${params.overdueDate}`,
            '',
            'Vänligen betala snarast möjligt. Svara på detta mejl om du har frågor.',
        ].join('\n')

        await sendResendEmail(cfg, {
            to: params.recipientEmail,
            subject,
            html,
            text,
        })

        await logEvent('email_sent', 'family', params.familyId, {
            to: params.recipientEmail,
            type: 'reminder',
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

// --------------------------------------------------------
// Log login event (called from client after successful auth)
// --------------------------------------------------------
export async function logLoginAction() {
    await logEvent('login', 'auth', '', {})
}

// --------------------------------------------------------
// Log logout event
// --------------------------------------------------------
export async function logLogoutAction() {
    await logEvent('logout', 'auth', '', {})
}
