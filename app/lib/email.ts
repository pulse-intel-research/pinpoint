const RESEND_API_URL = "https://api.resend.com/emails"
const ALERT_TO = process.env.ALERT_EMAIL || "jj.epstein@yahoo.com"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nextjs-boilerplate-liart-sigma-53.vercel.app"

export type EdgeAlert = {
  team: string
  opponent: string
  league: string
  book: string
  price: number
  ev: number
  edge: number
}

export async function sendEdgeAlert(bet: EdgeAlert): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: "Missing RESEND_API_KEY" }

  const priceStr = bet.price > 0 ? `+${bet.price}` : `${bet.price}`
  const ev = Math.round(bet.ev * 10) / 10
  const edge = Math.round(bet.edge * 10) / 10

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Pinpoint <onboarding@resend.dev>",
      to: [ALERT_TO],
      subject: `+EV edge: ${bet.team} ${priceStr} @ ${bet.book}`,
      html: `
        <div style="font-family: system-ui, sans-serif; color: #111;">
          <h2 style="margin: 0 0 12px;">${bet.team} vs ${bet.opponent}</h2>
          <p style="margin: 0 0 4px;"><strong>League:</strong> ${bet.league}</p>
          <p style="margin: 0 0 4px;"><strong>Book:</strong> ${bet.book}</p>
          <p style="margin: 0 0 4px;"><strong>Price:</strong> ${priceStr}</p>
          <p style="margin: 0 0 4px;"><strong>EV:</strong> ${ev}%</p>
          <p style="margin: 0 0 16px;"><strong>Edge:</strong> ${edge}%</p>
          <a href="${APP_URL}" style="color: #1D9E75;">View the board →</a>
        </div>
      `,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    return { ok: false, error: `Resend ${res.status}: ${text}` }
  }
  return { ok: true }
}
