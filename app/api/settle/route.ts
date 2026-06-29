import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    )
    const key = process.env.ODDS_API_KEY || ""
    const scoresRes = await fetch(
      "https://api.the-odds-api.com/v4/sports/baseball_mlb/scores/?apiKey=" + key + "&daysFrom=3"
    )
    const games = await scoresRes.json()

    const { data: bets, error: readErr } = await supabase
      .from("flagged_bets")
      .select("*")
      .is("result", null)
    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 })
    }

    let settled = 0
    for (const bet of bets || []) {
      const game = games.find((g: any) => g.id === bet.game_id)
      if (!game || !game.completed || !game.scores) continue
      const teamScore = game.scores.find((s: any) => s.name === bet.team)
      const oppScore = game.scores.find((s: any) => s.name === bet.opponent)
      if (!teamScore || !oppScore) continue
      const won = Number(teamScore.score) > Number(oppScore.score)
      const finalScore = bet.team + " " + teamScore.score + " - " + oppScore.score + " " + bet.opponent
      await supabase
        .from("flagged_bets")
        .update({
          result: won ? "win" : "loss",
          final_score: finalScore,
          settled_at: new Date().toISOString(),
        })
        .eq("id", bet.id)
      settled++
    }
    return NextResponse.json({ settled, checked: (bets || []).length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
