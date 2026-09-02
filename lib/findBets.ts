import { calculateEV, edgePercent, americanToImpliedProb } from "../app/lib/ev"
import { devig } from "../app/lib/devig"

export type Outcome = { name: string; price: number }
export type Market = { key: string; outcomes: Outcome[] }
export type Bookmaker = { key: string; title: string; markets: Market[] }
export type Game = { id: string; sport_key: string; home_team: string; away_team: string; commence_time: string; bookmakers: Bookmaker[] }

export type Bet = {
  id: string; gameId: string; commenceTime: string; team: string; opp: string; book: string; price: number
  modelProb: number; implied: number; ev: number; edge: number; time: string; league: string
}

const LEAGUE_LABELS: Record<string, string> = {
  baseball_mlb: "MLB",
  basketball_wnba: "WNBA",
  americanfootball_nfl: "NFL",
}

// Books used only to establish the true probability — never appear in bet output.
// Ordered by sharpness; first book with a line wins. "lowvig" comes from the-odds-api;
// "pinnacle" comes from OddsPapi (lowvig.ag isn't usable there — see lib/oddsPapiAdapter.ts).
export const REFERENCE_BOOKS = ["lowvig", "pinnacle"]

// Books evaluated for +EV opportunities. Must not overlap with REFERENCE_BOOKS.
export const BETTABLE_BOOKS = ["fanduel", "draftkings", "betmgm", "williamhill_us", "betrivers"]

// Sanity backstop. A moneyline edge this large (percentage points) or EV this high against a
// mainstream US book almost always means bad reference data — a stale line, the wrong side
// matched, a postponed/in-play game — not a real market inefficiency. findBets drops any
// candidate past these bounds and logs it for manual review. Consensus-fallback references
// (no sharp book in the feed) are noisier than a true sharp line, so they get a tighter bound.
export const MAX_PLAUSIBLE_EDGE = 8
export const MAX_PLAUSIBLE_CONSENSUS_EDGE = 5
export const MAX_PLAUSIBLE_EV = 25

export function sharpProbs(
  g: Game,
): { trueAway: number; trueHome: number; method: "sharp" | "consensus" } | null {
  // Primary: first available reference book
  for (const refKey of REFERENCE_BOOKS) {
    const book = g.bookmakers.find((b) => b.key === refKey)
    const market = book?.markets.find((m) => m.key === "h2h")
    const away = market?.outcomes.find((o) => o.name === g.away_team)
    const home = market?.outcomes.find((o) => o.name === g.home_team)
    if (away && home) {
      const d = devig(away.price, home.price)
      return { trueAway: d.probA, trueHome: d.probB, method: "sharp" }
    }
  }

  // Fallback: consensus across bettable books
  const awayProbs: number[] = []
  const homeProbs: number[] = []
  for (const b of g.bookmakers) {
    if (!BETTABLE_BOOKS.includes(b.key)) continue
    const m = b.markets.find((m) => m.key === "h2h")
    const away = m?.outcomes.find((o) => o.name === g.away_team)
    const home = m?.outcomes.find((o) => o.name === g.home_team)
    if (!away || !home) continue
    const d = devig(away.price, home.price)
    awayProbs.push(d.probA)
    homeProbs.push(d.probB)
  }
  if (awayProbs.length < 2) return null
  return {
    trueAway: awayProbs.reduce((a, b) => a + b, 0) / awayProbs.length,
    trueHome: homeProbs.reduce((a, b) => a + b, 0) / homeProbs.length,
    method: "consensus",
  }
}

export function findBets(games: Game[]): Bet[] {
  const bets: Bet[] = []
  const now = Date.now()
  for (const g of games) {
    // Pre-game lines only. Once a game starts, the-odds-api keeps returning it with in-play
    // prices, and books update those at different speeds — devigging one book's stale in-play
    // number against another's fresh one manufactures large phantom edges (whole game lights
    // up at once off a single bad reference). The OddsPapi adapter already filters this via
    // statusId; the-odds-api exposes no in-play flag, so gate on commence_time here.
    if (!g.commence_time || new Date(g.commence_time).getTime() <= now) continue

    const probs = sharpProbs(g)
    if (!probs) continue
    const { trueAway, trueHome } = probs

    for (const b of g.bookmakers) {
      if (!BETTABLE_BOOKS.includes(b.key)) continue
      const m = b.markets.find((m) => m.key === "h2h")
      if (!m) continue
      for (const o of m.outcomes) {
        const truth = o.name === g.away_team ? trueAway : trueHome
        const ev = calculateEV(truth, o.price)
        if (ev < 2) continue
        if (o.price > 250 || o.price < -250) continue

        const edge = edgePercent(truth, o.price)
        const edgeCap = probs.method === "consensus" ? MAX_PLAUSIBLE_CONSENSUS_EDGE : MAX_PLAUSIBLE_EDGE
        if (edge > edgeCap || ev > MAX_PLAUSIBLE_EV) {
          console.warn(
            `findBets: suppressed implausible edge — ${o.name} (${g.away_team} @ ${g.home_team}) ` +
              `${b.key} ${o.price}: edge ${edge}% ev ${ev}% method ${probs.method}, ` +
              `truth ${(truth * 100).toFixed(1)}% vs implied ${(americanToImpliedProb(o.price) * 100).toFixed(1)}%`
          )
          continue
        }

        bets.push({
          id: g.id + o.name + b.key,
          gameId: g.id,
          commenceTime: g.commence_time,
          team: o.name,
          opp: o.name === g.away_team ? g.home_team : g.away_team,
          book: b.title,
          price: o.price,
          modelProb: Math.round(truth * 1000) / 10,
          implied: Math.round(americanToImpliedProb(o.price) * 1000) / 10,
          ev,
          edge,
          time: new Date(g.commence_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          league: LEAGUE_LABELS[g.sport_key] || g.sport_key,
        })
      }
    }
  }
  return bets.sort((a, b) => b.ev - a.ev).slice(0, 15)
}
