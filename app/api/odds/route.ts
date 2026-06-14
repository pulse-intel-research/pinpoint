import { NextResponse } from "next/server"

export async function GET() {
  const apiKey = process.env.SPORTSGAMEODDS_API_KEY
  if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 500 })
  const res = await fetch("https://api.sportsgameodds.com/v2/events?leagueID=MLB&oddsAvailable=true&limit=5", { headers: { "X-Api-Key": apiKey } })
  const data = await res.json()
  return NextResponse.json(data)
}
