"use client"
import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { Gate } from "../lib/Gate"
import { Nav } from "../lib/Nav"

type Row = {
  id: string; team: string; opponent: string; book: string; price: number
  edge: number; ev: number; result: string | null; final_score: string | null
  settled_at: string | null; flagged_at: string; _bookCount: number
}

function unitsWon(price: number): number {
  return price > 0 ? price / 100 : 100 / Math.abs(price)
}

export default function Track() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    )
    supabase
      .from("flagged_bets")
      .select("*")
      .order("flagged_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setLoadError(error.message)
          setLoading(false)
          return
        }
        setRows((data as Row[]) || [])
        setLoading(false)
      })
  }, [])

  const pending = rows
    .filter((r) => r.result === null)
    .sort((a, b) => (b.flagged_at || "").localeCompare(a.flagged_at || ""))

  const settled = rows.filter((r) => r.result !== null)

  const gameMap = new Map<string, Row>()
  for (const r of settled) {
    const key = r.team + "|" + r.opponent
    const existing = gameMap.get(key)
    if (!existing) {
      gameMap.set(key, { ...r, _bookCount: 1 })
    } else {
      const newCount = (existing._bookCount || 1) + 1
      if (1 + unitsWon(r.price) > 1 + unitsWon(existing.price)) {
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

  let net = 0
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < games.length; i++) {
    const r = games[i]
    if (r.result === "win") net += unitsWon(r.price)
    else net -= 1
    points.push({ x: i + 1, y: net })
  }
  const roi = total > 0 ? Math.round((net / total) * 1000) / 10 : 0

  const W = 680, H = 200, pad = 24
  const ys = points.map((p) => p.y).concat([0])
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rangeY = maxY - minY || 1
  const sx = (x: number) => pad + ((x - 1) / Math.max(points.length - 1, 1)) * (W - pad * 2)
  const sy = (y: number) => H - pad - ((y - minY) / rangeY) * (H - pad * 2)
  const path = points.map((p, i) => (i === 0 ? "M" : "L") + sx(p.x).toFixed(1) + " " + sy(p.y).toFixed(1)).join(" ")
  const zeroY = sy(0)

  return (
    <Gate>
      <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif" }}>
        <Nav />

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 48px" }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", marginBottom: 4 }}>Track record</div>
            <div style={{ fontSize: 13, color: "#555" }}>Settled results · one bet per game · best-priced book</div>
          </div>

          {loading ? (
            <div style={{ color: "#555", fontSize: 14 }}>Loading…</div>
          ) : loadError ? (
            <div style={{ background: "#1a0d0d", border: "1px solid #3a1a1a", borderRadius: 10, padding: "14px 18px", color: "#e05252", fontSize: 14 }}>
              Failed to load results: {loadError}
            </div>
          ) : (
            <>
              {pending.length > 0 && (
                <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 12, padding: "20px 22px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, fontWeight: 600 }}>
                    Pending · awaiting settlement
                  </div>
                  {pending.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #171717" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{r.team} <span style={{ color: "#555", fontWeight: 400 }}>vs {r.opponent}</span></div>
                        <div style={{ color: "#555", fontSize: 12, marginTop: 3 }}>
                          {r.book} · {r.price > 0 ? "+" : ""}{r.price} · {Math.round(r.edge * 10) / 10}% edge · {Math.round(r.ev * 10) / 10}% EV
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#c9a227" }}>PENDING</div>
                        <div style={{ color: "#555", fontSize: 11, marginTop: 3 }}>
                          {new Date(r.flagged_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {total === 0 ? (
                <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "48px 32px", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>No settled results yet</div>
                  <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6 }}>
                    Results appear here automatically once games complete and settlement runs.
                  </div>
                </div>
              ) : (
              <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Record", value: `${wins}–${losses}`, color: "#e8e8e8" },
                  { label: "Hit rate", value: `${hitRate}%`, color: "#e8e8e8" },
                  { label: "ROI / bet", value: `${roi >= 0 ? "+" : ""}${roi}%`, color: roi >= 0 ? "#1D9E75" : "#e05252" },
                ].map((s) => (
                  <div key={s.label} style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 12, padding: "20px 22px" }}>
                    <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 12, padding: "20px 22px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, fontWeight: 600 }}>
                  Cumulative units ({net >= 0 ? "+" : ""}{Math.round(net * 100) / 100}u)
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="#222" strokeDasharray="4 4" />
                  {points.length > 1 && <path d={path} fill="none" stroke="#1D9E75" strokeWidth="1.5" strokeLinejoin="round" />}
                </svg>
              </div>

              <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 12, padding: "20px 22px" }}>
                <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, fontWeight: 600 }}>
                  All settled bets
                </div>
                {[...games].reverse().map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #171717" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{r.team} <span style={{ color: "#555", fontWeight: 400 }}>vs {r.opponent}</span></div>
                      <div style={{ color: "#555", fontSize: 12, marginTop: 3 }}>
                        {r.book} · {r.price > 0 ? "+" : ""}{r.price} · {Math.round(r.edge * 10) / 10}% edge{r._bookCount > 1 ? ` · ${r._bookCount} books` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: r.result === "win" ? "#1D9E75" : "#e05252" }}>
                        {r.result === "win" ? "WIN" : "LOSS"}
                      </div>
                      {r.final_score && <div style={{ color: "#555", fontSize: 11, marginTop: 3 }}>{r.final_score}</div>}
                    </div>
                  </div>
                ))}
              </div>
              </>
              )}
            </>
          )}
        </div>
      </div>
    </Gate>
  )
}
