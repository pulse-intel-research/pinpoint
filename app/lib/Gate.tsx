"use client"

import { useAuth } from "./useAuth"

export function Gate({ children }: { children: React.ReactNode }) {
  const auth = useAuth()

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#888", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        Loading…
      </div>
    )
  }

  if (!auth.userId) {
    if (typeof window !== "undefined") window.location.href = "/login"
    return null
  }

  return <>{children}</>
}
