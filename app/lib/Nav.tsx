"use client"

import { usePathname } from "next/navigation"
import { useAuth } from "./useAuth"
import { supabase } from "./supabaseClient"

async function signOut() {
  await supabase.auth.signOut()
  window.location.href = "/login"
}

export function Nav() {
  const auth = useAuth()
  const path = usePathname()

  return (
    <nav style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 24px", borderBottom: "1px solid #1a1a1a", marginBottom: 40,
      fontFamily: "system-ui, sans-serif",
    }}>
      <a href="/" style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, textDecoration: "none", color: "#e8e8e8" }}>
        PIN<span style={{ color: "#1D9E75" }}>POINT</span>
      </a>

      <div style={{ display: "flex", gap: 6 }}>
        {([["/" , "Board"], ["/track", "Track"], ["/settings", "Settings"]] as const).map(([href, label]) => {
          const active = path === href
          return (
            <a
              key={href}
              href={href}
              style={{
                fontSize: 13, fontWeight: 500, textDecoration: "none",
                padding: "6px 14px", borderRadius: 7,
                color: active ? "#e8e8e8" : "#666",
                background: active ? "#181818" : "transparent",
                border: active ? "1px solid #262626" : "1px solid transparent",
              }}
            >
              {label}
            </a>
          )
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!auth.loading && (
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
            padding: "3px 9px", borderRadius: 5,
            ...(auth.tier === "premium"
              ? { color: "#f5c842", background: "#2a200f", border: "1px solid #4a3a10" }
              : { color: "#888", background: "#181818", border: "1px solid #242424" }),
          }}>
            {auth.tier === "premium" ? "Premium" : "Core"}
          </div>
        )}
        <button
          onClick={signOut}
          style={{ fontSize: 12, color: "#555", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
