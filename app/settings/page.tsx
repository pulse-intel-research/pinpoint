"use client"

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"
import { Gate } from "../lib/Gate"
import { Nav } from "../lib/Nav"
import { useAuth } from "../lib/useAuth"

const LEAGUES = ["MLB", "NBA", "NFL", "NHL"]
const MARKETS = ["moneyline", "props", "parlays"]
const SPORTSBOOKS = ["FanDuel", "DraftKings", "BetMGM", "Caesars", "BetRivers"]

type Prefs = {
  leagues: string[]
  markets: string[]
  min_ev: number
  sportsbooks: string[]
}

const DEFAULTS: Prefs = {
  leagues: ["MLB", "NBA", "NFL", "NHL"],
  markets: ["moneyline"],
  min_ev: 2,
  sportsbooks: ["FanDuel", "DraftKings", "BetMGM", "Caesars", "BetRivers"],
}

function Chip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: "7px 15px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
        border: active ? "1px solid #1a4736" : "1px solid #1f1f1f",
        background: active ? "#0f2a20" : "#141414",
        color: active ? "#1D9E75" : "#666",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", color: "#555", marginBottom: 12, fontWeight: 600 }}>
      {children}
    </div>
  )
}

export default function Settings() {
  const auth = useAuth()
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (auth.loading || !auth.userId) return
    supabase
      .from("notification_preferences")
      .select("leagues, markets, min_ev, sportsbooks")
      .eq("user_id", auth.userId)
      .single()
      .then(({ data }) => {
        if (data) setPrefs(data)
        setLoading(false)
      })
  }, [auth.loading, auth.userId])

  function toggle(field: "leagues" | "markets" | "sportsbooks", value: string) {
    setPrefs((p) => {
      const arr = p[field]
      return { ...p, [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] }
    })
    setSaved(false)
  }

  async function save() {
    if (!auth.userId) return
    setSaving(true)
    await supabase.from("notification_preferences").upsert({
      user_id: auth.userId,
      ...prefs,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    setSaved(true)
  }

  return (
    <Gate>
      <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif" }}>
        <Nav />

        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px 48px" }}>
          {/* Account section */}
          <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "24px", marginBottom: 32 }}>
            <SectionLabel>Account</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, color: "#ccc", marginBottom: 4 }}>{auth.email || "—"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                    textTransform: "uppercase", padding: "3px 9px", borderRadius: 5,
                    ...(auth.tier === "premium"
                      ? { color: "#f5c842", background: "#2a200f", border: "1px solid #4a3a10" }
                      : { color: "#888", background: "#181818", border: "1px solid #242424" }),
                  }}>
                    {auth.tier === "premium" ? "Premium" : "Core"}
                  </div>
                  {auth.tier !== "premium" && (
                    <a href="/login" style={{ fontSize: 12, color: "#1D9E75", textDecoration: "none" }}>
                      Upgrade →
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Preferences section */}
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Alert preferences</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 28 }}>Choose which bets trigger your alerts.</div>

          {loading ? (
            <div style={{ color: "#555", fontSize: 14 }}>Loading…</div>
          ) : (
            <>
              <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "24px", marginBottom: 16 }}>
                <SectionLabel>Leagues</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {LEAGUES.map((l) => (
                    <Chip key={l} label={l} active={prefs.leagues.includes(l)} onToggle={() => toggle("leagues", l)} />
                  ))}
                </div>
              </div>

              <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "24px", marginBottom: 16 }}>
                <SectionLabel>Market types</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {MARKETS.map((m) => (
                    <Chip key={m} label={m.charAt(0).toUpperCase() + m.slice(1)} active={prefs.markets.includes(m)} onToggle={() => toggle("markets", m)} />
                  ))}
                </div>
              </div>

              <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "24px", marginBottom: 16 }}>
                <SectionLabel>Minimum EV threshold</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={prefs.min_ev}
                    onChange={(e) => { setPrefs((p) => ({ ...p, min_ev: parseFloat(e.target.value) || 0 })); setSaved(false) }}
                    style={{ width: 88, padding: "8px 12px", background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8, color: "#e8e8e8", fontSize: 14, fontFamily: "inherit" }}
                  />
                  <span style={{ fontSize: 13, color: "#555" }}>% expected value</span>
                </div>
              </div>

              <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 14, padding: "24px", marginBottom: 28 }}>
                <SectionLabel>Sportsbooks</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SPORTSBOOKS.map((s) => (
                    <Chip key={s} label={s} active={prefs.sportsbooks.includes(s)} onToggle={() => toggle("sportsbooks", s)} />
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button
                  onClick={save}
                  disabled={saving}
                  style={{ padding: "11px 26px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "inherit" }}
                >
                  {saving ? "Saving…" : "Save preferences"}
                </button>
                {saved && <span style={{ fontSize: 13, color: "#1D9E75" }}>✓ Saved</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </Gate>
  )
}
