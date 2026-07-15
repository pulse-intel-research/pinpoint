import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { findBets, type Bet } from "../../../lib/findBets"

const SPORTS = ["baseball_mlb", "basketball_wnba"]

export async function GET(req: Request) {
  try {
    const pollSecret = process.env.POLL_SECRET
    const url = new URL(req.url)
    const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret")
    if (!pollSecret || provided !== pollSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const apiKey = process.env.ODDS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 })
    }
    const responses = await Promise.all(
      SPORTS.map((sport) =>
        fetch(
          `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`,
          { next: { revalidate: 60 } }
        )
      )
    )
    const failed = responses.find((res) => !res.ok)
    if (failed) {
      return NextResponse.json({ error: `API responded with ${failed.status}` }, { status: failed.status })
    }
    const games = (await Promise.all(responses.map((res) => res.json()))).flat()

    const bets = findBets(games)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    )

    const bestByGameTeam = new Map<string, Bet>()
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

    let inserted = 0
    let updated = 0
    const logged: { game_id: string; team: string; ev: number; action: "inserted" | "updated" }[] = []
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
        inserted++
        logged.push({ game_id: row.game_id, team: row.team, ev: row.ev, action: "inserted" })
      } else if ((row.ev ?? 0) > (existing.ev ?? 0)) {
        await supabase.from("flagged_bets").update(row).eq("id", existing.id)
        updated++
        logged.push({ game_id: row.game_id, team: row.team, ev: row.ev, action: "updated" })
      }
    }

    return NextResponse.json({ found: bets.length, candidates: rows.length, inserted, updated, logged })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
