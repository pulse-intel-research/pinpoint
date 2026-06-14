import { NextResponse } from "next/server"

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 })
  }
  const url = `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`
  const res = await fetch(url, { next: { revalidate: 60 } })
  if (!res.ok) {
    return NextResponse.json({ error: `API responded with ${res.status}` }, { status: res.status })
  }
  const data = await res.json()
  return NextResponse.json(data)
}
