"use client"

import { useEffect, useState } from "react"
import { calculateEV, edgePercent, americanToImpliedProb } from "./lib/ev"
import { devig } from "./lib/devig"
import { useAuth } from "./lib/useAuth"
import { Nav } from "./lib/Nav"

type Outcome = { name: string; price: number }
type Market = { key: string; outcomes: Outcome[] }
type Bookmaker = { key: string; title: string; markets: Market[] }
type Game = { id: string; sport_key: string; home_team: string; away_team: string; commence_time: string; bookmakers: Bookmaker[] }

type Bet = {
  id: string; gameId: string; commenceTime: string; team: string; opp: string; book: string; price: number
  modelProb: number; implied: number; ev: number; edge: number; time: string; league: string
}

const LEAGUE_LABELS: Record<string, string> = {
  baseball_mlb: "MLB",
  basketball_wnba: "WNBA",
}

// Books used only to establish the true probability — never appear in bet output.
// Ordered by sharpness; first book with a line wins.
const REFERENCE_BOOKS = ["lowvig"]

// Books evaluated for +EV opportunities. Must not overlap with REFERENCE_BOOKS.
const BETTABLE_BOOKS = ["fanduel", "draftkings", "betmgm", "williamhill_us", "betrivers"]

function sharpProbs(
  g: Game,
): { trueAway: number; trueHome: number; method: "sharp" | "consensus" } | null {
  // Primary: first available reference book
  for (const refKey of REFERENCE_BOOKS) {
    const book = g.bookmakers.find((b) => b.key === refKey)
    const market = book?.markets.find((m) => m.key === "h2h")
    const away = market?.outcomes.find((o) => o.name === g.away_team)
    const home = market?.outcomes.find((o) => o.name === g.home_team)
    if (away && home) {
      const d = devig(away.price, home.price)
      return { trueAway: d.probA, trueHome: d.probB, method: "sharp" }
    }
  }

  // Fallback: consensus across bettable books
  const awayProbs: number[] = []
  const homeProbs: number[] = []
  for (const b of g.bookmakers) {
    if (!BETTABLE_BOOKS.includes(b.key)) continue
    const m = b.markets.find((m) => m.key === "h2h")
    const away = m?.outcomes.find((o) => o.name === g.away_team)
    const home = m?.outcomes.find((o) => o.name === g.home_team)
    if (!away || !home) continue
    const d = devig(away.price, home.price)
    awayProbs.push(d.probA)
    homeProbs.push(d.probB)
  }
  if (awayProbs.length < 2) return null
  return {
    trueAway: awayProbs.reduce((a, b) => a + b, 0) / awayProbs.length,
    trueHome: homeProbs.reduce((a, b) => a + b, 0) / homeProbs.length,
    method: "consensus",
  }
}

function findBets(games: Game[]): Bet[] {
  const bets: Bet[] = []
  for (const g of games) {
    const probs = sharpProbs(g)
    if (!probs) continue
    const { trueAway, trueHome } = probs

    for (const b of g.bookmakers) {
      if (!BETTABLE_BOOKS.includes(b.key)) continue
      const m = b.markets.find((m) => m.key === "h2h")
      if (!m) continue
      for (const o of m.outcomes) {
        const truth = o.name === g.away_team ? trueAway : trueHome
        const ev = calculateEV(truth, o.price)
        if (ev < 2) continue
        if (o.price > 250 || o.price < -250) continue
        bets.push({
          id: g.id + o.name + b.key,
          gameId: g.id,
          commenceTime: g.commence_time,
          team: o.name,
          opp: o.name === g.away_team ? g.home_team : g.away_team,
          book: b.title,
          price: o.price,
          modelProb: Math.round(truth * 1000) / 10,
          implied: Math.round(americanToImpliedProb(o.price) * 1000) / 10,
          ev,
          edge: edgePercent(truth, o.price),
          time: new Date(g.commence_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          league: LEAGUE_LABELS[g.sport_key] || g.sport_key,
        })
      }
    }
  }
  return bets.sort((a, b) => b.ev - a.ev).slice(0, 15)
}

function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: "1px solid #141414" }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>
          PIN<span style={{ color: "#1D9E75" }}>POINT</span>
        </div>
        <a href="/login" style={{ fontSize: 13, fontWeight: 600, color: "#1D9E75", background: "#0f2a20", border: "1px solid #1a4736", borderRadius: 8, padding: "8px 18px", textDecoration: "none" }}>
          Sign in
        </a>
      </nav>

      <section style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", padding: "96px 32px 80px" }}>
        <div style={{ display: "inline-block", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#1D9E75", background: "#0f2a20", border: "1px solid #1a4736", borderRadius: 20, padding: "5px 14px", marginBottom: 28 }}>
          Positive EV Sports Betting
        </div>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 58px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-1px", margin: "0 0 24px" }}>
          Stop guessing.<br />
          <span style={{ color: "#1D9E75" }}>Bet when the math says so.</span>
        </h1>
        <p style={{ fontSize: 18, color: "#999", lineHeight: 1.6, maxWidth: 520, margin: "0 auto 40px" }}>
          Pinpoint monitors sportsbook lines in real time, identifies mispriced odds using sharp-book consensus, and alerts you the moment a +EV edge appears.
        </p>
        <a href="/login" style={{ display: "inline-block", background: "#1D9E75", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px 36px", borderRadius: 10, textDecoration: "none", letterSpacing: "0.01em" }}>
          Start finding edges →
        </a>
        <div style={{ marginTop: 16, fontSize: 13, color: "#555" }}>No credit card required to sign up</div>
      </section>

      <section style={{ background: "#0d0d0d", borderTop: "1px solid #141414", borderBottom: "1px solid #141414", padding: "80px 32px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#1D9E75", marginBottom: 12 }}>How it works</div>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.5px", margin: 0 }}>Three steps to an edge</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
            {[
              { step: "01", title: "We monitor lines", body: "Pinpoint pulls live odds from every major US sportsbook every minute, across all markets." },
              { step: "02", title: "We find +EV edges", body: "We build a true-probability model from sharp-book consensus, then compare it against every line to surface mispriced bets." },
              { step: "03", title: "We alert you", body: "When an edge appears, you see it instantly on your dashboard — ranked by expected value so you know where to strike first." },
            ].map((s) => (
              <div key={s.step} style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "28px 24px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1D9E75", marginBottom: 14, letterSpacing: "0.05em" }}>{s.step}</div>
                <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 10 }}>{s.title}</div>
                <div style={{ fontSize: 14, color: "#888", lineHeight: 1.6 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "80px 32px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#1D9E75", marginBottom: 12 }}>Pricing</div>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.5px", margin: 0 }}>Simple, transparent plans</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 16, padding: "32px 28px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Core</div>
              <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-1px", marginBottom: 4 }}>$29<span style={{ fontSize: 16, fontWeight: 400, color: "#666" }}>/mo</span></div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>Everything you need to get started</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 12 }}>
                {["Live +EV dashboard", "MLB moneyline coverage", "Top 15 edges per refresh", "Ranked by expected value"].map((f) => (
                  <li key={f} style={{ fontSize: 14, color: "#ccc", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "#1D9E75", fontWeight: 700, flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="/login" style={{ display: "block", textAlign: "center", background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#e8e8e8", fontWeight: 600, fontSize: 14, padding: "12px", borderRadius: 9, textDecoration: "none" }}>
                Get started
              </a>
            </div>
            <div style={{ background: "#0e1f18", border: "1px solid #1D9E75", borderRadius: 16, padding: "32px 28px", position: "relative" }}>
              <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#1D9E75", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 14px", borderRadius: 20 }}>
                Most popular
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Premium</div>
              <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-1px", marginBottom: 4 }}>$49<span style={{ fontSize: 16, fontWeight: 400, color: "#5a9e87" }}>/mo</span></div>
              <div style={{ fontSize: 13, color: "#5a9e87", marginBottom: 28 }}>For serious bettors who want every edge</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 12 }}>
                {["Everything in Core", "Multi-sport coverage", "Email & SMS alerts", "Edge probability breakdowns", "Historical performance data"].map((f) => (
                  <li key={f} style={{ fontSize: 14, color: "#ccc", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "#1D9E75", fontWeight: 700, flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a href="/login" style={{ display: "block", textAlign: "center", background: "#1D9E75", color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px", borderRadius: 9, textDecoration: "none" }}>
                Start free trial
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #141414", padding: "32px", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
          PIN<span style={{ color: "#1D9E75" }}>POINT</span>
        </div>
        <p style={{ fontSize: 12, color: "#555", margin: "0 auto", maxWidth: 460, lineHeight: 1.6 }}>
          Pinpoint is a data-driven edge-finding tool. Past performance does not guarantee future results. Bet responsibly.
        </p>
      </footer>
    </div>
  )
}

const BOOK_URLS: Record<string, string> = {
  "FanDuel": "https://sportsbook.fanduel.com",
  "DraftKings": "https://sportsbook.draftkings.com",
  "BetMGM": "https://sports.betmgm.com",
  "Caesars": "https://www.caesars.com/sportsbook-and-casino",
  "BetRivers": "https://www.betrivers.com",
  "PointsBet": "https://pointsbet.com",
  "WynnBET": "https://wynnbet.com",
}

function BetCard({ b, rank }: { b: Bet; rank: number }) {
  const bookUrl = BOOK_URLS[b.book]
  return (
    <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "20px 22px", marginBottom: 10 }}>
      {/* Top row: rank + team + odds + EV */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#333", minWidth: 24, paddingTop: 3 }}>#{rank}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.2px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#888", background: "#181818", border: "1px solid #262626", borderRadius: 5, padding: "2px 7px", letterSpacing: "0.04em" }}>{b.league}</span>
              {b.team} <span style={{ color: "#555", fontWeight: 500, fontSize: 14 }}>ML</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#e8e8e8", letterSpacing: "-0.5px" }}>
                {b.price > 0 ? "+" : ""}{b.price}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1D9E75", background: "#0d2118", padding: "4px 10px", borderRadius: 20, border: "1px solid #173d2a", letterSpacing: "0.02em" }}>
                +{b.ev}% EV
              </div>
            </div>
          </div>

          {/* Matchup line */}
          <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>
            vs {b.opp} &nbsp;·&nbsp; {b.book} &nbsp;·&nbsp; {b.time}
          </div>

          {/* Edge bar + Bet now */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, height: 4, background: "#1c1c1c", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(b.edge * 4, 100)}%`, height: "100%", background: "#1D9E75", borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, color: "#666", flexShrink: 0 }}>{b.edge}% edge</span>
            </div>
            {bookUrl ? (
              <a
                href={bookUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, color: "#fff", background: "#1D9E75", padding: "7px 16px", borderRadius: 8, textDecoration: "none", letterSpacing: "0.01em" }}
              >
                Bet now →
              </a>
            ) : (
              <div style={{ flexShrink: 0, fontSize: 13, fontWeight: 500, color: "#555", padding: "7px 16px", borderRadius: 8, background: "#141414", border: "1px solid #1f1f1f" }}>
                {b.book}
              </div>
            )}
          </div>

          {/* Model detail */}
          <div style={{ fontSize: 11, color: "#444", marginTop: 10 }}>
            Model {b.modelProb}% true &nbsp;·&nbsp; Implied {b.implied}%
          </div>
        </div>
      </div>
    </div>
  )
}

function Dashboard() {
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [refreshed, setRefreshed] = useState<Date | null>(null)

  function load() {
    setLoading(true)
    setErr("")
    fetch("/api/odds")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setErr(data.error); return }
        const found = findBets(data)
        setBets(found)
        setRefreshed(new Date())
        if (found.length > 0) {
          fetch("/api/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(found) }).catch(() => {})
        }
      })
      .catch(() => setErr("Failed to load odds"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const timeStr = refreshed
    ? refreshed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif" }}>
      <Nav />

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 48px" }}>
        {/* Status bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="monitor-dot"
              style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: loading ? "#555" : "#1D9E75", flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: "#555", letterSpacing: "0.03em" }}>
              {loading
                ? "Scanning sportsbooks…"
                : `${bets.length} edge${bets.length !== 1 ? "s" : ""} · MLB & WNBA moneyline${timeStr ? ` · Updated ${timeStr}` : ""}`}
            </span>
          </div>
          {!loading && (
            <button
              onClick={load}
              style={{ fontSize: 12, color: "#555", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
            >
              Refresh ↻
            </button>
          )}
        </div>

        {err && (
          <div style={{ background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 10, padding: "14px 18px", color: "#e05252", fontSize: 14, marginBottom: 16 }}>
            {err}
          </div>
        )}

        {!loading && !err && bets.length === 0 && (
          <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}>
              <span className="monitor-dot" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#1D9E75" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1D9E75", letterSpacing: "0.05em", textTransform: "uppercase" }}>Monitoring live</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>No edges above 2% EV right now</div>
            <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6, maxWidth: 340, margin: "0 auto 24px" }}>
              Markets look efficient at the moment. New opportunities surface throughout the day as lines shift.
            </div>
            <button
              onClick={load}
              style={{ padding: "9px 22px", background: "#181818", border: "1px solid #262626", borderRadius: 8, color: "#aaa", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
            >
              Check again
            </button>
          </div>
        )}

{bets.map((b, i) => <BetCard key={b.id} b={b} rank={i + 1} />)}
      </div>
    </div>
  )
}

export default function Home() {
  const auth = useAuth()

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ fontSize: 13, color: "#444" }}>Loading…</div>
      </div>
    )
  }

  return auth.userId ? <Dashboard /> : <LandingPage />
}
