import { NextResponse } from "next/server"

const SPORTS = ["baseball_mlb", "basketball_wnba"]

export async function GET() {
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
  const games = await Promise.all(responses.map((res) => res.json()))
  return NextResponse.json(games.flat())
}
