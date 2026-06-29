"use client"
import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"

type Row = {
  id: string; team: string; opponent: string; book: string; price: number
  edge: number; ev: number; result: string | null; final_score: string | null
  settled_at: string | null; flagged_at: string
}

function unitsWon(price: number): number {
  return price > 0 ? price / 100 : 100 / Math.abs(price)
}

export default function Track() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    )
    supabase
      .from("flagged_bets")
      .select("*")
      .not("result", "is", null)
      .order("settled_at", { ascending: true })
      .then(({ data }) => {
        setRows((data as Row[]) || [])
        setLoading(false)
      })
  }, [])

  // Dedup: one game = one bet. The same prediction logged at multiple books
  // was inflating the record (e.g. one Brewers loss counted 4x). Collapse by
  // matchup, keeping the best-priced version (what a line-shopping bettor takes).
  const gameMap = new Map<string, Row & { _bookCount: number }>()
  for (const r of rows) {
    const key = r.team + "|" + r.opponent
    const payout = 1 + unitsWon(r.price)
    const existing = gameMap.get(key)
    if (!existing) {
      gameMap.set(key, { ...r, _bookCount: 1 })
    } else {
      const newCount = existing._bookCount + 1
      if (payout > 1 + unitsWon(existing.price)) {
        gameMap.set(key, { ...r, _bookCount: newCount })
      } else {
        existing._bookCount = newCount
      }
    }
  }
  const games = Array.from(gameMap.values()).sort(
    (a, b) => (a.settled_at || "").localeCompare(b.settled_at || "")
  )

  const wins = games.filter((r) => r.result === "win").length
  const losses = games.filter((r) => r.result === "loss").length
  const total = wins + losses
  const hitRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0

  let running = 0
  const points: { x: number; y: number }[] = []
  let net = 0
  for (let i = 0; i < games.length; i++) {
    const r = games[i]
    if (r.result === "win") net += unitsWon(r.price)
    else net -= 1
    running = net
    points.push({ x: i + 1, y: running })
  }
  const roi = total > 0 ? Math.round((net / total) * 1000) / 10 : 0

  const W = 680, H = 220, pad = 30
  const ys = points.map((p) => p.y).concat([0])
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rangeY = maxY - minY || 1
  const sx = (x: number) => pad + ((x - 1) / Math.max(points.length - 1, 1)) * (W - pad * 2)
  const sy = (y: number) => H - pad - ((y - minY) / rangeY) * (H - pad * 2)
  const path = points.map((p, i) => (i === 0 ? "M" : "L") + sx(p.x) + " " + sy(p.y)).join(" ")
  const zeroY = sy(0)

  const card = { background: "#141414", border: "1px solid #262626", borderRadius: 12, padding: "20px 24px" }
  const label = { color: "#888", fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 0.5 }
  const stat = { fontSize: 28, fontWeight: 600, marginTop: 4 }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif", padding: "32px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>
            <span style={{ color: "#e8e8e8" }}>PIN</span><span style={{ color: "#1D9E75" }}>POINT</span>
          </div>
          <a href="/" style={{ color: "#1D9E75", fontSize: 13, textDecoration: "none" }}>← Live Board</a>
        </div>
        <div style={{ color: "#888", fontSize: 13, marginBottom: 24 }}>TRACK RECORD · SETTLED RESULTS · ONE BET PER GAME</div>

        {loading ? (
          <div style={{ color: "#888" }}>Loading…</div>
        ) : total === 0 ? (
          <div style={{ ...card, color: "#888" }}>
            No settled bets yet. Results will appear here automatically once games complete and settlement runs.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div style={card}>
                <div style={label}>Record</div>
                <div style={stat}>{wins}–{losses}</div>
              </div>
              <div style={card}>
                <div style={label}>Hit Rate</div>
                <div style={stat}>{hitRate}%</div>
              </div>
              <div style={card}>
                <div style={label}>ROI / Bet</div>
                <div style={{ ...stat, color: roi >= 0 ? "#1D9E75" : "#e05252" }}>{roi >= 0 ? "+" : ""}{roi}%</div>
              </div>
            </div>

            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ ...label, marginBottom: 12 }}>Cumulative Units ({net >= 0 ? "+" : ""}{Math.round(net * 100) / 100}u)</div>
              <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto" }}>
                <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="#333" strokeDasharray="3 3" />
                <path d={path} fill="none" stroke="#1D9E75" strokeWidth="2" />
              </svg>
            </div>

            <div style={card}>
              <div style={{ ...label, marginBottom: 12 }}>All Settled Bets</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...games].reverse().map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1f1f1f" }}>
                    <div>
                      <div style={{ fontSize: 14 }}>{r.team} <span style={{ color: "#666" }}>vs {r.opponent}</span></div>
                      <div style={{ color: "#777", fontSize: 12, marginTop: 2 }}>{r.book} · {r.price > 0 ? "+" : ""}{r.price} · {Math.round(r.edge * 10) / 10}% edge{r._bookCount > 1 ? ` · ${r._bookCount} books` : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: r.result === "win" ? "#1D9E75" : "#e05252" }}>{r.result === "win" ? "WIN" : "LOSS"}</div>
                      <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>{r.final_score}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}