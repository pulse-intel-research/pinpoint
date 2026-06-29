import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    const supabase = createClient(url, key)
    const bets = await req.json()
    if (!Array.isArray(bets) || bets.length === 0) {
      return NextResponse.json({ logged: 0 })
    }
    const bestByGameTeam = new Map<string, typeof bets[0]>()
    for (const b of bets) {
      const k = `${b.gameId}|${b.team}`
      const existing = bestByGameTeam.get(k)
      if (!existing || (b.ev ?? 0) > (existing.ev ?? 0)) {
        bestByGameTeam.set(k, b)
      }
    }
    const rows = Array.from(bestByGameTeam.values()).map((b) => ({
      game_id: b.gameId,
      team: b.team,
      opponent: b.opp,
      book: b.book,
      price: b.price,
      model_prob: b.modelProb,
      implied_prob: b.implied,
      edge: b.edge,
      ev: b.ev,
      commence_time: b.commenceTime || null,
    }))
    for (const row of rows) {
      const { data: existing } = await supabase
        .from("flagged_bets")
        .select("id, ev")
        .eq("game_id", row.game_id)
        .eq("team", row.team)
        .is("result", null)
        .single()
      if (!existing) {
        await supabase.from("flagged_bets").insert(row)
      } else if ((row.ev ?? 0) > (existing.ev ?? 0)) {
        await supabase.from("flagged_bets").update(row).eq("id", existing.id)
      }
    }
    return NextResponse.json({ logged: rows.length })
  } catch (e) {
    return NextResponse.json({ error: "Bad request" }, { status: 500 })
  }
}
