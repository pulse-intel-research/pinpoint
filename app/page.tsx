"use client"

import { calculateEV, edgePercent, americanToImpliedProb } from "./lib/ev"
import { devig } from "./lib/devig"

const mockGames = [
  { id: 1, sport: "MLB", away: "Marlins", home: "Pirates", time: "Live · 3rd", sharpAway: -130, sharpHome: 110, softAway: -115, softHome: 105, bet: "Marlins ML", betSide: "away" },
  { id: 2, sport: "MLB", away: "Dodgers", home: "Padres", time: "7:10 PM", sharpAway: 145, sharpHome: -165, softAway: 175, softHome: -190, bet: "Dodgers ML", betSide: "away" },
  { id: 3, sport: "MLB", away: "Yankees", home: "Red Sox", time: "8:05 PM", sharpAway: -110, sharpHome: -110, softAway: -102, softHome: -118, bet: "Yankees ML", betSide: "away" },
  { id: 4, sport: "MLB", away: "Braves", home: "Mets", time: "7:40 PM", sharpAway: 120, sharpHome: -140, softAway: 138, softHome: -155, bet: "Braves ML", betSide: "away" },
]

export default function Home() {
  const bets = mockGames.map((g) => {
    const truth = devig(g.sharpAway, g.sharpHome)
    const modelProb = g.betSide === "away" ? truth.probA : truth.probB
    const offered = g.betSide === "away" ? g.softAway : g.softHome
    const ev = calculateEV(modelProb, offered)
    const edge = edgePercent(modelProb, offered)
    const implied = Math.round(americanToImpliedProb(offered) * 1000) / 10
    return { ...g, modelProb: Math.round(modelProb * 1000) / 10, offered, ev, edge, implied }
  })
  .filter((b) => b.ev > 0)
  .sort((a, b) => b.ev - a.ev)

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif", padding: "32px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #1f1f1f" }}>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px" }}>PIN<span style={{ color: "#1D9E75" }}>POINT</span></div>
          <div style={{ fontSize: 12, color: "#1D9E75", background: "#0f2a20", padding: "4px 10px", borderRadius: 6, border: "1px solid #1a4736" }}>{bets.length} +EV bets</div>
        </div>

        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#666", marginBottom: 16 }}>Ranked by expected value</div>

        {bets.map((b, i) => (
          <div key={b.id} style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 12, padding: "16px 20px", marginBottom: 12, display: "flex", gap: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#444", minWidth: 28 }}>#{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{b.bet}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{b.sport} · {b.away} @ {b.home} · {b.time}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#1D9E75", background: "#0f2a20", padding: "3px 10px", borderRadius: 6 }}>{b.offered > 0 ? "+" : ""}{b.offered}</div>
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
              <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>Model: {b.modelProb}% true vs {b.implied}% implied</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}