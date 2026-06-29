"use client"

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"
import { Gate } from "../lib/Gate"
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
        padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
        border: active ? "1px solid #1a4736" : "1px solid #262626",
        background: active ? "#0f2a20" : "#141414",
        color: active ? "#1D9E75" : "#666",
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
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
      <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif", padding: "32px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #1f1f1f" }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px" }}>
              PIN<span style={{ color: "#1D9E75" }}>POINT</span>
            </div>
            <a href="/" style={{ fontSize: 13, color: "#555", textDecoration: "none" }}>← Board</a>
          </div>

          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Notification preferences</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 32 }}>
            Choose which bets you want to be alerted about.
          </div>

          {loading ? (
            <div style={{ color: "#555", fontSize: 14 }}>Loading…</div>
          ) : (
            <>
              <Section title="Leagues">
                {LEAGUES.map((l) => (
                  <Chip key={l} label={l} active={prefs.leagues.includes(l)} onToggle={() => toggle("leagues", l)} />
                ))}
              </Section>

              <Section title="Market types">
                {MARKETS.map((m) => (
                  <Chip key={m} label={m.charAt(0).toUpperCase() + m.slice(1)} active={prefs.markets.includes(m)} onToggle={() => toggle("markets", m)} />
                ))}
              </Section>

              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555", marginBottom: 12 }}>
                  Minimum EV threshold
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={prefs.min_ev}
                    onChange={(e) => { setPrefs((p) => ({ ...p, min_ev: parseFloat(e.target.value) || 0 })); setSaved(false) }}
                    style={{ width: 88, padding: "8px 12px", background: "#141414", border: "1px solid #262626", borderRadius: 8, color: "#e8e8e8", fontSize: 14 }}
                  />
                  <span style={{ fontSize: 13, color: "#555" }}>% expected value</span>
                </div>
              </div>

              <Section title="Sportsbooks">
                {SPORTSBOOKS.map((s) => (
                  <Chip key={s} label={s} active={prefs.sportsbooks.includes(s)} onToggle={() => toggle("sportsbooks", s)} />
                ))}
              </Section>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                <button
                  onClick={save}
                  disabled={saving}
                  style={{ padding: "10px 24px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Saving…" : "Save preferences"}
                </button>
                {saved && <span style={{ fontSize: 13, color: "#1D9E75" }}>Saved</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </Gate>
  )
}
