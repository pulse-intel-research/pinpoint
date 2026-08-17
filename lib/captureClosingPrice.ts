import type { Game } from "./findBets"
import { REFERENCE_BOOKS } from "./findBets"

// How close to game time counts as "at risk" of missing the 30-min snapshot cron.
export const CAPTURE_RISK_WINDOW_MINUTES = 90

export function minutesUntilCommence(commenceTime: string): number {
  const now = new Date()
  const commence = new Date(commenceTime)
  return (commence.getTime() - now.getTime()) / 1000 / 60
}

// Pulls the current reference-book (LowVig) American price for a team directly
// from an already-fetched Game object — no extra API call needed, since /api/poll
// already has the full odds payload in memory when it inserts a new bet.
export function getReferencePrice(game: Game, team: string): number | null {
  for (const refKey of REFERENCE_BOOKS) {
    const book = game.bookmakers.find((b) => b.key === refKey)
    const market = book?.markets.find((m) => m.key === "h2h")
    const outcome = market?.outcomes.find((o) => o.name === team)
    if (outcome) return outcome.price
  }
  return null
}