#!/usr/bin/env python3
"""
Backtest #1 (BATCHED) — resumable, N games per day

Truth  = Pinnacle de-vigged closing line
Bet    = FanDuel / DraftKings closing price, when +EV vs Pinnacle truth
Test   = did those +EV bets actually win?

Usage:
  python3 backtest1_batched.py              # runs 15 games
  python3 backtest1_batched.py --batch 20   # runs 20 games
  python3 backtest1_batched.py --report     # prints results so far, no API calls
  python3 backtest1_batched.py --reset      # deletes checkpoint and starts over

Checkpoint: /tmp/backtest1_progress.jsonl
Run from inside ~/pinpoint
"""

import json, time, sys, os, urllib.request, argparse
from datetime import datetime, timezone

# ── config ──────────────────────────────────────────────────────────────────
PAUSE        = 3.5          # seconds between API calls (stay under quota)
RETRY_PAUSE  = 9.0          # seconds before retry on failure
STALE_HOURS  = 6            # ignore soft-book price if this old vs game start
DATE_FROM    = "2026-06-12"
DATE_TO      = "2026-06-19"
SPORT_ID     = 13           # MLB
TOURNAMENT   = 109
BASE         = "https://api.oddspapi.io/v4"
PROGRESS     = "/tmp/backtest1_progress.jsonl"
HEADERS      = {"User-Agent": "curl/8.0", "Accept": "application/json"}
DEFAULT_BATCH = 15
# ────────────────────────────────────────────────────────────────────────────


def load_key():
    try:
        with open(".env.local") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("ODDSPAPI_KEY="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        print("ERROR: run from inside ~/pinpoint")
        sys.exit(1)
    print("ERROR: ODDSPAPI_KEY not in .env.local")
    sys.exit(1)


def api_get(path, key):
    sep = "&" if "?" in path else "?"
    url = f"{BASE}/{path}{sep}apiKey={key}"
    for attempt in range(3):
        try:
            if attempt > 0:
                print(f"      retry {attempt}…")
                time.sleep(RETRY_PAUSE)
            else:
                time.sleep(PAUSE)
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"\n  ⛔  HTTP 429 — daily quota hit after {attempt} retries")
                print("     Come back tomorrow and run again. Checkpoint is safe.\n")
                sys.exit(2)
            print(f"      HTTP {e.code} on attempt {attempt+1}")
        except Exception as e:
            print(f"      Error on attempt {attempt+1}: {e}")
    return None


# ── math (mirrors ev.ts / devig.ts exactly) ─────────────────────────────────
def american_to_decimal(odds):
    return odds / 100 + 1 if odds > 0 else 100 / abs(odds) + 1

def american_to_implied(odds):
    d = american_to_decimal(odds)
    return 1 / d

def devig(odds_a, odds_b):
    ia = american_to_implied(odds_a)
    ib = american_to_implied(odds_b)
    total = ia + ib
    return round(ia / total, 4), round(ib / total, 4)

def calc_ev(true_prob, american_odds):
    dec = american_to_decimal(american_odds)
    ev = true_prob * (dec - 1) - (1 - true_prob)
    return round(ev * 1000) / 10   # percent, 1 dp
# ────────────────────────────────────────────────────────────────────────────


def load_checkpoint():
    done = {}
    if os.path.exists(PROGRESS):
        with open(PROGRESS) as fh:
            for line in fh:
                line = line.strip()
                if line:
                    try:
                        rec = json.loads(line)
                        done[rec["game_id"]] = rec
                    except Exception:
                        pass
    return done


def append_checkpoint(rec):
    with open(PROGRESS, "a") as fh:
        fh.write(json.dumps(rec) + "\n")


def print_report(done):
    bets = [r for r in done.values() if r.get("bet")]
    passes = [r for r in done.values() if not r.get("bet")]
    settled = [b for b in bets if b.get("won") is not None]

    print(f"\n{'='*58}")
    print(f"  PINPOINT BACKTEST #1  —  {len(done)} games processed")
    print(f"{'='*58}")
    print(f"  Bets flagged:   {len(bets)}")
    print(f"  Passes (no +EV): {len(passes)}")
    print(f"  Settled bets:   {len(settled)}")

    if not settled:
        print("\n  No settled bets yet — keep running daily batches.\n")
        return

    wins   = sum(1 for b in settled if b["won"])
    losses = len(settled) - wins
    profit = sum(b["profit"] for b in settled)
    print(f"\n  Record:   {wins}W – {losses}L")
    print(f"  Profit:   {profit:+.2f} units (1u flat)")
    print(f"  ROI:      {profit/len(settled)*100:+.1f}% per bet")

    print("\n  By edge size:")
    for lo, hi in [(0,1),(1,2),(2,3),(3,5),(5,100)]:
        seg = [b for b in settled if lo <= b["ev"] < hi]
        if seg:
            w  = sum(1 for b in seg if b["won"])
            pr = sum(b["profit"] for b in seg)
            print(f"    EV {lo:2d}-{hi if hi<100 else '∞'}%:  "
                  f"{len(seg):2d} bets  {w}W-{len(seg)-w}L  "
                  f"{pr:+.2f}u  ({pr/len(seg)*100:+.1f}% ROI)")

    if len(bets) > 0:
        print("\n  Recent bets (last 5):")
        recent = sorted(bets, key=lambda b: b.get("game_id",""))[-5:]
        for b in recent:
            outcome = "✅ W" if b.get("won") else ("❌ L" if b.get("won") is False else "⏳ pending")
            print(f"    {b.get('game_id','')}  "
                  f"{b.get('team','')} @ {b.get('book','')}  "
                  f"{b.get('odds',''):+d}  EV {b.get('ev',0):.1f}%  {outcome}")

    print(f"\n  CAVEATS: FanDuel + DraftKings only (2 of 5 soft books).")
    print(f"  Read directionally until n > 200 bets.\n")


def fetch_games(key):
    path = (f"fixtures?sportId={SPORT_ID}&tournamentId={TOURNAMENT}"
            f"&dateFrom={DATE_FROM}&dateTo={DATE_TO}&status=finished")
    data = api_get(path, key)
    if not data:
        return []
    return data.get("data", data) if isinstance(data, dict) else data


def fetch_closing(game_id, book, key):
    path = f"historical-odds?gameId={game_id}&bookmaker={book}&market=h2h"
    data = api_get(path, key)
    if not data:
        return None
    rows = data.get("data", data) if isinstance(data, dict) else data
    if not rows:
        return None
    # sort by timestamp desc, take the last pre-start snapshot
    rows_sorted = sorted(rows, key=lambda r: r.get("timestamp",""), reverse=True)
    return rows_sorted[0] if rows_sorted else None


def parse_odds_row(row):
    """Return {home_odds, away_odds} or None."""
    if not row:
        return None
    outcomes = row.get("outcomes") or row.get("odds") or []
    if len(outcomes) < 2:
        return None
    home = away = None
    for o in outcomes:
        name = str(o.get("name","")).lower()
        price = o.get("price") or o.get("odds")
        if price is None:
            continue
        price = int(price) if abs(float(price)) >= 1 else None
        if price is None:
            continue
        if "home" in name or name == outcomes[0].get("name","").lower():
            home = price
        else:
            away = price
    if home is None or away is None:
        # fallback: first=home, second=away
        try:
            home = int(outcomes[0].get("price") or outcomes[0].get("odds"))
            away = int(outcomes[1].get("price") or outcomes[1].get("odds"))
        except Exception:
            return None
    return {"home": home, "away": away}


def process_game(game, done, key):
    gid  = str(game.get("id") or game.get("gameId",""))
    if not gid:
        return

    home = game.get("homeTeam") or game.get("home","")
    away = game.get("awayTeam") or game.get("away","")
    home_score = game.get("homeScore")
    away_score = game.get("awayScore")

    print(f"  {away} @ {home}  (id={gid})")

    # ── Pinnacle closing line ────────────────────────────────────────────
    pin_row = fetch_closing(gid, "pinnacle", key)
    pin = parse_odds_row(pin_row)
    if not pin:
        print("    skip: no Pinnacle line")
        append_checkpoint({"game_id": gid, "bet": False, "skip_reason": "no_pinnacle"})
        done[gid] = {"game_id": gid, "bet": False}
        return

    true_home, true_away = devig(pin["home"], pin["away"])
    print(f"    Pinnacle close: home {pin['home']:+d} / away {pin['away']:+d} "
          f"→ true {true_home:.3f} / {true_away:.3f}")

    # ── soft-book closing lines ──────────────────────────────────────────
    best_ev   = 0.0
    best_bet  = None

    for book in ["fanduel", "draftkings"]:
        sb_row = fetch_closing(gid, book, key)
        sb = parse_odds_row(sb_row)
        if not sb:
            print(f"    {book}: no data")
            continue
        print(f"    {book}: home {sb['home']:+d} / away {sb['away']:+d}")

        ev_home = calc_ev(true_home, sb["home"])
        ev_away = calc_ev(true_away, sb["away"])

        for side, ev, odds, team in [
            ("home", ev_home, sb["home"], home),
            ("away", ev_away, sb["away"], away),
        ]:
            if ev > best_ev:
                best_ev  = ev
                best_bet = {
                    "game_id": gid,
                    "book":    book,
                    "side":    side,
                    "team":    team,
                    "odds":    odds,
                    "ev":      ev,
                    "bet":     True,
                }

    if not best_bet or best_ev <= 0:
        print("    → PASS (no +EV vs Pinnacle)")
        rec = {"game_id": gid, "bet": False}
        append_checkpoint(rec)
        done[gid] = rec
        return

    # ── determine outcome ────────────────────────────────────────────────
    won = None
    profit = 0.0
    if home_score is not None and away_score is not None:
        home_won = int(home_score) > int(away_score)
        won = home_won if best_bet["side"] == "home" else not home_won
        if won:
            dec = american_to_decimal(best_bet["odds"])
            profit = round(dec - 1, 4)
        else:
            profit = -1.0

    best_bet["won"]    = won
    best_bet["profit"] = profit
    append_checkpoint(best_bet)
    done[best_bet["game_id"]] = best_bet

    result_str = "✅ WIN" if won else ("❌ LOSS" if won is False else "⏳ pending")
    print(f"    → BET: {best_bet['team']} ({best_bet['book']}) "
          f"{best_bet['odds']:+d}  EV {best_ev:.1f}%  {result_str}")


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch",  type=int, default=DEFAULT_BATCH,
                        help="games to process this run (default 15)")
    parser.add_argument("--report", action="store_true",
                        help="print results so far, no API calls")
    parser.add_argument("--reset",  action="store_true",
                        help="delete checkpoint and start over")
    args = parser.parse_args()

    if args.reset:
        if os.path.exists(PROGRESS):
            os.remove(PROGRESS)
            print("Checkpoint cleared.")
        else:
            print("No checkpoint to clear.")
        return

    done = load_checkpoint()

    if args.report:
        print_report(done)
        return

    key = load_key()
    print(f"Key loaded. Checkpoint: {len(done)} games already done.\n")

    # fetch full game list
    print("Fetching game list…")
    all_games = fetch_games(key)
    if not all_games:
        print("No games returned. Check API / dates.")
        sys.exit(1)
    print(f"Total games in window: {len(all_games)}\n")

    # filter to games not yet processed
    todo = [g for g in all_games
            if str(g.get("id") or g.get("gameId","")) not in done]

    if not todo:
        print("All games already processed!")
        print_report(done)
        return

    batch = todo[:args.batch]
    remaining_after = len(todo) - len(batch)

    print(f"This batch: {len(batch)} games  |  "
          f"Remaining after: {remaining_after}  |  "
          f"Total done after: {len(done)+len(batch)}/{len(all_games)}\n")

    for i, game in enumerate(batch, 1):
        gid = str(game.get("id") or game.get("gameId",""))
        print(f"[{i}/{len(batch)}]  ", end="")
        process_game(game, done, key)

    print(f"\nBatch complete. {len(done)} / {len(all_games)} games done.")
    if remaining_after > 0:
        batches_left = -(-remaining_after // args.batch)   # ceiling div
        print(f"Run again tomorrow: ~{batches_left} more batch(es) to finish.\n")
    else:
        print("All games processed!\n")

    print_report(done)


if __name__ == "__main__":
    main()
