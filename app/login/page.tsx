"use client"

import { useState } from "react"
import { supabase } from "../lib/supabaseClient"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [msg, setMsg] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    setMsg("")
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMsg(error.message)
      else window.location.href = "/"
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg(error.message)
      else window.location.href = "/"
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1, marginBottom: 28, textAlign: "center" }}>
          <span style={{ color: "#e8e8e8" }}>PIN</span><span style={{ color: "#1D9E75" }}>POINT</span>
        </div>
        <div style={{ background: "#141414", border: "1px solid #262626", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {mode === "login" ? "Sign in" : "Create account"}
          </div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", marginBottom: 10, background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8, color: "#e8e8e8", fontSize: 14, boxSizing: "border-box" }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", marginBottom: 16, background: "#0a0a0a", border: "1px solid #262626", borderRadius: 8, color: "#e8e8e8", fontSize: 14, boxSizing: "border-box" }}
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ width: "100%", padding: "11px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "..." : mode === "login" ? "Sign in" : "Sign up"}
          </button>
          {msg && <div style={{ color: "#e05252", fontSize: 13, marginTop: 12 }}>{msg}</div>}
          <div style={{ marginTop: 16, fontSize: 13, color: "#888", textAlign: "center" }}>
            {mode === "login" ? "No account?" : "Have an account?"}{" "}
            <span
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg("") }}
              style={{ color: "#1D9E75", cursor: "pointer" }}
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
