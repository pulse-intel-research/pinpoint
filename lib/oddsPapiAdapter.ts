import type { Game, Bookmaker } from "./findBets"

const BASE = "https://api.oddspapi.io/v4"

// sportId/tournamentId confirmed live against /v4/sports and /v4/tournaments?sportId=X for
// each -- OddsPapi's sport IDs don't follow a guessable pattern (American Football is 14, not
// 16 as a naive guess might assume; 16 is actually ESport Dota).
// tournamentId 31 is NFL regular season specifically; OddsPapi models NFL Preseason (233) as a
// separate tournament, mirroring the-odds-api's separate americanfootball_nfl_preseason key.
export const ODDSPAPI_SPORTS: { sportKey: string; sportId: number; tournamentId: number }[] = [
  { sportKey: "baseball_mlb", sportId: 13, tournamentId: 109 },
  { sportKey: "basketball_wnba", sportId: 11, tournamentId: 486 },
  { sportKey: "americanfootball_nfl", sportId: 14, tournamentId: 31 },
]

// OddsPapi always resolves "lowvig.ag" to its clone source ("betonline.ag") rather than lowvig
// itself -- confirmed 100% substitution across a full day's MLB slate, not spotty missing-line
// behavior. Pinnacle self-resolves cleanly, so it's the sharp reference for this source instead.
// (Must also be added to REFERENCE_BOOKS in findBets.ts.)
export const ODDSPAPI_REFERENCE_BOOK = "pinnacle"

// williamhill_us (the-odds-api's key) has no usable OddsPapi equivalent: "williamhill" has
// liveOdds:false and "williamhill-nj" is a NJ-only clone of caesars. Dropped for this source.
export const ODDSPAPI_BETTABLE_BOOKS = ["fanduel", "draftkings", "betmgm", "betrivers"]

const BOOK_TITLES: Record<string, string> = {
  fanduel: "FanDuel",
  draftkings: "DraftKings",
  betmgm: "BetMGM",
  betrivers: "BetRivers",
}

type OddsPapiFixture = {
  fixtureId: string
  tournamentId: number
  statusId: number
  participant1Name: string
  participant2Name: string
  startTime: string
}

type OddsPapiOutcome = { players?: Record<string, { priceAmerican?: string; bookmakerOutcomeId?: string }> }
type OddsPapiMarket = { bookmakerMarketId: string | number; outcomes: Record<string, OddsPapiOutcome> }
type OddsPapiOddsFixture = {
  fixtureId: string
  bookmakerOdds?: Record<string, { markets: Record<string, OddsPapiMarket> }>
}

type MoneylineSchema = { marketKey: string; homeKey: string; awayKey: string }

// Only some books (e.g. pinnacle) label bookmakerMarketId with readable text; others (e.g.
// fanduel) use opaque per-book decimal IDs with no semantic meaning. So this schema can only be
// discovered from a book with readable labels, then reused as a plain dict-key lookup elsewhere --
// confirmed the resolved market/outcome keys are a fixed per-sport constant, not fixture-specific.
function resolveMoneylineSchema(markets: Record<string, OddsPapiMarket>): MoneylineSchema | null {
  for (const [marketKey, m] of Object.entries(markets)) {
    const label = String(m.bookmakerMarketId).toLowerCase()
    if (!label.includes("moneyline") && !label.includes("money line")) continue
    if (label.includes("/")) {
      // path-style labels encode a period segment (e.g. "line/.../0/moneyline"); period "0" is
      // the full-game line -- other periods are distinct markets (e.g. regulation-time-only)
      // that happen to share the "moneyline" substring.
      const segments = label.split("/")
      if (segments[segments.length - 2] !== "0") continue
    }
    const outcomes = Object.entries(m.outcomes || {})
    if (outcomes.length !== 2) continue
    const idOf = (o: OddsPapiOutcome) => String(o.players?.["0"]?.bookmakerOutcomeId || "").toLowerCase()
    const home = outcomes.find(([, o]) => idOf(o).includes("home"))
    const away = outcomes.find(([, o]) => idOf(o).includes("away"))
    if (home && away) return { marketKey, homeKey: home[0], awayKey: away[0] }
  }
  return null
}

function priceAt(markets: Record<string, OddsPapiMarket>, schema: MoneylineSchema, side: "home" | "away"): number | null {
  const key = side === "home" ? schema.homeKey : schema.awayKey
  const american = markets?.[schema.marketKey]?.outcomes?.[key]?.players?.["0"]?.priceAmerican
  if (american == null) return null
  const n = Number(american)
  return Number.isFinite(n) ? n : null
}

// Confirmed lowvig-style substitution risk: OddsPapi can key bookmakerOdds under a different
// book than requested (its clone source). Only trust an exact key match -- never fall back to
// whatever book happens to be present, since that would silently mislabel whose price this is.
function ownOdds(fx: OddsPapiOddsFixture, requestedBook: string) {
  const bo = fx.bookmakerOdds?.[requestedBook]
  return bo ?? null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// OddsPapi has no documented rate-limit headers, but concurrent/rapid calls reliably return
// transient 429s and occasional 500s that clear within a couple seconds. Retry those a few
// times before giving up; any other non-ok status is a real failure and throws immediately.
async function fetchJson(url: string, label: string): Promise<any> {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, { cache: "no-store" })
    if (res.ok) return res.json()
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < maxAttempts) {
      await sleep(1500 * attempt)
      continue
    }
    throw new Error(`${label} failed: ${res.status}`)
  }
}

async function fetchFixtures(apiKey: string, sportId: number, tournamentId: number, from: string, to: string): Promise<OddsPapiFixture[]> {
  const url = `${BASE}/fixtures?apiKey=${apiKey}&sportId=${sportId}&tournamentId=${tournamentId}&from=${from}&to=${to}&hasOdds=true`
  const maxAttempts = 3
  let data: OddsPapiFixture[] = []
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, { cache: "no-store" })
    if (res.ok) {
      data = (await res.json()) as OddsPapiFixture[]
      break
    }
    if (res.status === 404) {
      // OddsPapi 404s (rather than returning []) when nothing matches the from/to window --
      // the normal state for a sport whose next slate falls outside it (e.g. NFL between
      // weekly games, or before the season starts). Only treat this specific error code as
      // "no fixtures"; any other 404 body is a real problem and should still surface.
      const body = await res.json().catch(() => null)
      if (body?.error?.code === "FIXTURE_NOT_FOUND") return []
    }
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < maxAttempts) {
      await sleep(1500 * attempt)
      continue
    }
    throw new Error(`OddsPapi fixtures (sport ${sportId}) failed: ${res.status}`)
  }
  // statusId 0 = Pre-Game; exclude in-progress/finished games, whose current moneyline no
  // longer reflects a pre-game line comparable to the other bookmakers' pre-game prices.
  return data.filter((fx) => fx.statusId === 0)
}

async function fetchOddsByTournaments(apiKey: string, tournamentIds: number[], bookmaker: string): Promise<OddsPapiOddsFixture[]> {
  const url = `${BASE}/odds-by-tournaments?apiKey=${apiKey}&tournamentIds=${tournamentIds.join(",")}&bookmaker=${bookmaker}`
  return (await fetchJson(url, `OddsPapi odds-by-tournaments (${bookmaker})`)) as OddsPapiOddsFixture[]
}

export async function fetchOddsPapiGames(apiKey: string): Promise<Game[]> {
  // Wide enough to reliably span a full NFL week (Thu/Sun/Mon cadence with multi-day gaps
  // between slates) -- a narrower window tuned for MLB/WNBA's daily cadence would routinely
  // miss the next NFL slate if queried on an off day.
  const from = new Date().toISOString().slice(0, 10)
  const to = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10)
  const tournamentIds = ODDSPAPI_SPORTS.map((s) => s.tournamentId)

  // Sequential, not Promise.all -- OddsPapi returns transient 429s under concurrent requests.
  const fixtureLists: OddsPapiFixture[][] = []
  for (const s of ODDSPAPI_SPORTS) {
    fixtureLists.push(await fetchFixtures(apiKey, s.sportId, s.tournamentId, from, to))
    await sleep(300)
  }

  // fixtureId -> fixture metadata, keyed so both the reference and bettable-book passes can
  // attach prices to the same Game object regardless of which books have coverage for it.
  const metaById = new Map<string, { sportKey: string; home: string; away: string; commenceTime: string }>()
  fixtureLists.forEach((fixtures, i) => {
    const sportKey = ODDSPAPI_SPORTS[i].sportKey
    for (const fx of fixtures) {
      metaById.set(fx.fixtureId, {
        sportKey,
        home: fx.participant1Name, // confirmed via live schedule cross-check: participant1 = home, participant2 = away
        away: fx.participant2Name,
        commenceTime: fx.startTime,
      })
    }
  })
  if (metaById.size === 0) return []

  const referenceOdds = await fetchOddsByTournaments(apiKey, tournamentIds, ODDSPAPI_REFERENCE_BOOK)

  // The moneyline market/outcome keys are a fixed constant per sport (not per fixture) --
  // resolve once per sport from whichever fixture has a usable reference-book schema.
  const schemaBySport = new Map<string, MoneylineSchema>()
  for (const fx of referenceOdds) {
    const meta = metaById.get(fx.fixtureId)
    if (!meta || schemaBySport.has(meta.sportKey)) continue
    const bo = ownOdds(fx, ODDSPAPI_REFERENCE_BOOK)
    if (!bo) continue
    const schema = resolveMoneylineSchema(bo.markets)
    if (schema) schemaBySport.set(meta.sportKey, schema)
  }

  const gamesById = new Map<string, Game>()
  const getOrCreateGame = (fixtureId: string): Game | null => {
    let game = gamesById.get(fixtureId)
    if (game) return game
    const meta = metaById.get(fixtureId)
    if (!meta) return null
    game = {
      id: fixtureId,
      sport_key: meta.sportKey,
      home_team: meta.home,
      away_team: meta.away,
      commence_time: meta.commenceTime,
      bookmakers: [],
    }
    gamesById.set(fixtureId, game)
    return game
  }

  for (const fx of referenceOdds) {
    const meta = metaById.get(fx.fixtureId)
    const schema = meta && schemaBySport.get(meta.sportKey)
    if (!meta || !schema) continue
    const bo = ownOdds(fx, ODDSPAPI_REFERENCE_BOOK)
    if (!bo) continue
    const homePrice = priceAt(bo.markets, schema, "home")
    const awayPrice = priceAt(bo.markets, schema, "away")
    if (homePrice == null || awayPrice == null) continue
    const game = getOrCreateGame(fx.fixtureId)
    if (!game) continue
    game.bookmakers.push({
      key: ODDSPAPI_REFERENCE_BOOK,
      title: "Pinnacle",
      markets: [{ key: "h2h", outcomes: [
        { name: meta.home, price: homePrice },
        { name: meta.away, price: awayPrice },
      ] }],
    })
  }

  const bettableOdds: OddsPapiOddsFixture[][] = []
  for (const book of ODDSPAPI_BETTABLE_BOOKS) {
    await sleep(300)
    bettableOdds.push(await fetchOddsByTournaments(apiKey, tournamentIds, book))
  }

  ODDSPAPI_BETTABLE_BOOKS.forEach((book, i) => {
    for (const fx of bettableOdds[i]) {
      const meta = metaById.get(fx.fixtureId)
      const schema = meta && schemaBySport.get(meta.sportKey)
      if (!meta || !schema) continue
      const bo = ownOdds(fx, book)
      if (!bo) continue
      const homePrice = priceAt(bo.markets, schema, "home")
      const awayPrice = priceAt(bo.markets, schema, "away")
      if (homePrice == null || awayPrice == null) continue
      const game = getOrCreateGame(fx.fixtureId)
      if (!game) continue
      const bookmaker: Bookmaker = {
        key: book,
        title: BOOK_TITLES[book] || book,
        markets: [{ key: "h2h", outcomes: [
          { name: meta.home, price: homePrice },
          { name: meta.away, price: awayPrice },
        ] }],
      }
      game.bookmakers.push(bookmaker)
    }
  })

  return Array.from(gamesById.values())
}
