import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    )
    const now = Date.now()
    const windowMs = 90 * 60 * 1000

    const { data: bets, error: readErr } = await supabase
      .from("flagged_bets")
      .select("*")
      .is("result", null)
    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 })
    }

    const upcoming = (bets || []).filter((bet) => {
      if (!bet.commence_time) return false
      const start = new Date(bet.commence_time).getTime()
      return start > now && start - now <= windowMs
    })

    if (upcoming.length === 0) {
      return NextResponse.json({ captured: 0, checked: (bets || []).length, skipped: "no games in window" })
    }

    const key = process.env.ODDS_API_KEY || ""
    const sports = ["baseball_mlb", "basketball_wnba"]
    const oddsResponses = await Promise.all(
      sports.map((sport) =>
        fetch(
          "https://api.the-odds-api.com/v4/sports/" + sport + "/odds/?apiKey=" + key + "&regions=us&markets=h2h&oddsFormat=american"
        )
      )
    )
    const games = (await Promise.all(oddsResponses.map((r) => r.json()))).flat()

    let captured = 0
    for (const bet of upcoming) {
      const game = games.find((g: any) => g.id === bet.game_id)
      if (!game) continue
      const bk = (game.bookmakers || []).find((b: any) => b.title === bet.book)
      if (!bk) continue
      const m = (bk.markets || []).find((x: any) => x.key === "h2h")
      if (!m) continue
      const oc = (m.outcomes || []).find((o: any) => o.name === bet.team)
      if (!oc) continue
      await supabase
        .from("flagged_bets")
        .update({
          closing_price: oc.price,
          closing_captured_at: new Date().toISOString(),
        })
        .eq("id", bet.id)
      captured++
    }
    return NextResponse.json({ captured, checked: (bets || []).length, upcoming: upcoming.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
