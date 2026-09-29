// Resend delivery. Without RESEND_API_KEY every send is a dry run (recorded, not delivered).
export function mailConfig() {
  return {
    from: process.env.EMAIL_FROM || 'Kargo Hiring <onboarding@resend.dev>',
    reply_to: process.env.EMAIL_REPLY_TO || '',
    arjun_email: process.env.ARJUN_EMAIL || '',
    redirect_all_to: process.env.REDIRECT_ALL_TO || '',
    live: Boolean(process.env.RESEND_API_KEY),
  };
}

export async function sendEmail({ to, subject, body, idempotencyKey }) {
  const cfg = mailConfig();
  const realTo = cfg.redirect_all_to || to;
  const text = cfg.redirect_all_to ? `[TEST MODE — originally to ${to}]\n\n${body}` : body;
  if (!cfg.live) return { status: 'dry_run', to: realTo };
  const payload = { from: cfg.from, to: [realTo], subject, text };
  if (cfg.reply_to) payload.reply_to = cfg.reply_to;
  const headers = { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: 'error', to: realTo, error: `${r.status}: ${j.message || JSON.stringify(j).slice(0, 200)}` };
    return { status: 'sent', to: realTo, resend_id: j.id };
  } catch (e) {
    return { status: 'error', to: realTo, error: String(e.message || e) };
  }
}
