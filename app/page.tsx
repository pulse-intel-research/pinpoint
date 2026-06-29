"use client"

import { useEffect, useState } from "react"
import { calculateEV, edgePercent, americanToImpliedProb } from "./lib/ev"
import { devig } from "./lib/devig"
import { Gate } from "./lib/Gate"
import { useAuth } from "./lib/useAuth"

type Outcome = { name: string; price: number }
type Market = { key: string; outcomes: Outcome[] }
type Bookmaker = { key: string; title: string; markets: Market[] }
type Game = { id: string; home_team: string; away_team: string; commence_time: string; bookmakers: Bookmaker[] }

type Bet = {
  id: string; gameId: string; commenceTime: string; team: string; opp: string; book: string; price: number
  modelProb: number; implied: number; ev: number; edge: number; time: string
}

const SHARP = ["fanduel","draftkings","betmgm","williamhill_us","betrivers"]
function findBets(games: Game[]): Bet[] {
  const bets: Bet[] = []
  for (const g of games) {
    const h2hBooks = g.bookmakers.filter((b) => b.markets.some((m) => m.key === "h2h"))
    if (h2hBooks.length < 4) continue

    const awayProbs: number[] = []
    const homeProbs: number[] = []
    for (const b of h2hBooks) {
      if (SHARP.indexOf(b.key) === -1) continue
      const m = b.markets.find((m) => m.key === "h2h")
      if (!m) continue
      const away = m.outcomes.find((o) => o.name === g.away_team)
      const home = m.outcomes.find((o) => o.name === g.home_team)
      if (!away || !home) continue
      const d = devig(away.price, home.price)
      awayProbs.push(d.probA)
      homeProbs.push(d.probB)
    }
    if (awayProbs.length < 2) continue
    const trueAway = awayProbs.reduce((a, b) => a + b, 0) / awayProbs.length
    const trueHome = homeProbs.reduce((a, b) => a + b, 0) / homeProbs.length

    for (const b of h2hBooks) {
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
        })
      }
    }
  }
  return bets.sort((a, b) => b.ev - a.ev).slice(0, 15)
}

export default function Home() {
  const auth = useAuth()
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch("/api/odds")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setErr(data.error); return }
        const found = findBets(data)
        setBets(found)
        if (found.length > 0) {
          fetch("/api/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(found)}).catch(()=>{})
        }
      })
      .catch(() => setErr("Failed to load odds"))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Gate>
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif", padding: "32px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #1f1f1f" }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px" }}>PIN<span style={{ color: "#1D9E75" }}>POINT</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/settings" style={{ fontSize: 13, color: "#555", textDecoration: "none" }}>Settings</a>
            {!auth.loading && (
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
                padding: "4px 10px", borderRadius: 6,
                ...(auth.tier === "premium"
                  ? { color: "#f5c842", background: "#2a200f", border: "1px solid #4a3a10" }
                  : { color: "#888", background: "#181818", border: "1px solid #2a2a2a" })
              }}>
                {auth.tier === "premium" ? "Premium" : "Free"}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#1D9E75", background: "#0f2a20", padding: "4px 10px", borderRadius: 6, border: "1px solid #1a4736" }}>
              {loading ? "Loading..." : `${bets.length} +EV bets`}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#666", marginBottom: 16 }}>
          Live MLB · ranked by expected value
        </div>

        {err && <div style={{ color: "#e24b4a", fontSize: 14 }}>Error: {err}</div>}
        {!loading && !err && bets.length === 0 && <div style={{ color: "#888", fontSize: 14 }}>No +EV bets found right now. The market is efficient at the moment — check back later.</div>}

        {bets.map((b, i) => (
          <div key={b.id} style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 12, padding: "16px 20px", marginBottom: 12, display: "flex", gap: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#444", minWidth: 28 }}>#{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{b.team} ML</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>vs {b.opp} · {b.book} · {b.time}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#1D9E75", background: "#0f2a20", padding: "3px 10px", borderRadius: 6 }}>{b.price > 0 ? "+" : ""}{b.price}</div>
                  <div style={{ fontSize: 12, color: "#1D9E75", marginTop: 4 }}>+{b.ev}% EV</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 11, color: "#666" }}>Edge</span>
                <div style={{ flex: 1, height: 5, background: "#1f1f1f", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(b.edge * 4, 100)}%`, height: "100%", background: "#1D9E75" }} />
                </div>
                <span style={{ fontSize: 11, color: "#aaa" }}>{b.edge}%</span>
              </div>
              <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>Model: {b.modelProb}% true vs {b.implied}% implied · {b.book}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    </Gate>
  )
}