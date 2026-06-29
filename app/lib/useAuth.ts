"use client"

import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

export type AuthState = {
  loading: boolean
  userId: string | null
  email: string | null
  tier: string
  status: string
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    userId: null,
    email: null,
    tier: "free",
    status: "inactive",
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setState({ loading: false, userId: null, email: null, tier: "free", status: "inactive" })
        return
      }
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("tier, status")
        .eq("user_id", user.id)
        .single()
      setState({
        loading: false,
        userId: user.id,
        email: user.email || null,
        tier: sub?.tier || "free",
        status: sub?.status || "inactive",
      })
    }
    load()
  }, [])

  return state
}
