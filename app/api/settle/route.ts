import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { americanToImpliedProb } from "../../lib/ev"

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    )
    const key = process.env.ODDS_API_KEY || ""
    const sports = ["baseball_mlb", "basketball_wnba"]
    const scoresResponses = await Promise.all(
      sports.map((sport) =>
        fetch("https://api.the-odds-api.com/v4/sports/" + sport + "/scores/?apiKey=" + key + "&daysFrom=3")
      )
    )
    const games = (await Promise.all(scoresResponses.map((r) => r.json()))).flat()

    const { data: bets, error: readErr } = await supabase
      .from("flagged_bets")
      .select("*")
      .is("result", null)
    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 })
    }

    // The Odds API's scores endpoint only supports daysFrom up to 3 — a pending bet whose
    // game already commenced more than 3 days ago can never be matched by this lookup again.
    const MAX_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000
    const now = Date.now()

    let settled = 0
    const stale: { id: string; game_id: string; team: string; opponent: string; commence_time: string }[] = []
    for (const bet of bets || []) {
      const game = games.find((g: any) => g.id === bet.game_id)
      if (!game || !game.completed || !game.scores) {
        if (bet.commence_time && now - new Date(bet.commence_time).getTime() > MAX_LOOKBACK_MS) {
          stale.push({
            id: bet.id,
            game_id: bet.game_id,
            team: bet.team,
            opponent: bet.opponent,
            commence_time: bet.commence_time,
          })
        }
        continue
      }
      const teamScore = game.scores.find((s: any) => s.name === bet.team)
      const oppScore = game.scores.find((s: any) => s.name === bet.opponent)
      if (!teamScore || !oppScore) continue
      const won = Number(teamScore.score) > Number(oppScore.score)
      const finalScore = bet.team + " " + teamScore.score + " - " + oppScore.score + " " + bet.opponent
      const clv = bet.closing_price != null
        ? Math.round((americanToImpliedProb(bet.closing_price) - americanToImpliedProb(bet.price)) * 1000) / 10
        : null
      await supabase
        .from("flagged_bets")
        .update({
          result: won ? "win" : "loss",
          final_score: finalScore,
          settled_at: new Date().toISOString(),
          clv,
        })
        .eq("id", bet.id)
      settled++
    }
    if (stale.length > 0) {
      console.warn("settle: bets past the 3-day scores lookback window, will never auto-settle", stale)
    }
    return NextResponse.json({ settled, checked: (bets || []).length, stale })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
