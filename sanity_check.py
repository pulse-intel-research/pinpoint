#!/usr/bin/env python3
"""Pinpoint sanity check — do Pinnacle closing-line favorites win at the rate their prices imply?"""
import json, time, sys, urllib.request

MAX_GAMES = 100
PAUSE = 2.0
DATE_FROM = "2026-06-12"
DATE_TO   = "2026-06-19"
BASE = "https://api.oddspapi.io/v4"

KEY = None
try:
    with open(".env.local") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("ODDSPAPI_KEY="):
                KEY = line.split("=", 1)[1].strip(); break
except FileNotFoundError:
    print("ERROR: run this from inside ~/pinpoint (where .env.local lives)."); sys.exit(1)
if not KEY:
    print("ERROR: ODDSPAPI_KEY not found in .env.local"); sys.exit(1)
print(f"key loaded: {len(KEY)} chars (expect 36)\n")

HEADERS = {"User-Agent": "curl/8.0", "Accept": "application/json"}

def api_get(path):
    sep = "&" if "?" in path else "?"
    url = f"{BASE}/{path}{sep}apiKey={KEY}"
    for attempt in range(2):
        try:
            time.sleep(PAUSE)
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt == 0:
                time.sleep(4); continue
            print(f"    ! request failed: {e}"); return None

print(f"Pulling finished MLB games {DATE_FROM} to {DATE_TO} ...")
fixtures = api_get(f"fixtures?sportId=13&from={DATE_FROM}&to={DATE_TO}")
if not isinstance(fixtures, list):
    print("ERROR: fixtures response was not a list. Aborting."); sys.exit(1)
games = [f for f in fixtures if isinstance(f, dict)
         and f.get("tournamentId") == 109 and f.get("statusName") == "Finished"]
print(f"Found {len(games)} finished MLB games. Processing up to {MAX_GAMES}.\n")
games = games[:MAX_GAMES]

results = []; skipped = 0
for i, g in enumerate(games, 1):
    fid = g.get("fixtureId"); p1 = g.get("participant1Name","team1"); p2 = g.get("participant2Name","team2")
    start = g.get("startTime")
    print(f"[{i}/{len(games)}] {p1} vs {p2}")
    try:
        if not start:
            fx = api_get(f"fixture?fixtureId={fid}")
            if isinstance(fx, dict): start = fx.get("startTime")
            elif isinstance(fx, list) and fx: start = fx[0].get("startTime")
        if not start:
            print("    ! no startTime, skip"); skipped += 1; continue
        hist = api_get(f"historical-odds?fixtureId={fid}&bookmakers=pinnacle")
        try:
            outs = hist["bookmakers"]["pinnacle"]["markets"]["131"]["outcomes"]
        except (TypeError, KeyError):
            print("    ! no Pinnacle moneyline, skip"); skipped += 1; continue
        def closing(oid):
            snaps = outs.get(oid, {}).get("players", {}).get("0", [])
            pre = [s for s in snaps if s.get("createdAt","") < start]
            return pre[-1]["price"] if pre else None
        c1 = closing("131"); c2 = closing("132")
        if not c1 or not c2:
            print("    ! no pre-start price, skip"); skipped += 1; continue
        r1, r2 = 1.0/c1, 1.0/c2; over = r1+r2; f1, f2 = r1/over, r2/over
        sc = api_get(f"scores?fixtureId={fid}")
        try:
            per = sc["scores"]["periods"]; ft = per.get("fulltime") or per.get("result")
            s1 = ft["participant1Score"]; s2 = ft["participant2Score"]
        except (TypeError, KeyError):
            print("    ! no final score, skip"); skipped += 1; continue
        if s1 == s2:
            print("    ! tie in data, skip"); skipped += 1; continue
        team1_won = s1 > s2
        if f1 >= f2: fav_prob, fav_won, favname = f1, team1_won, p1
        else: fav_prob, fav_won, favname = f2, (not team1_won), p2
        results.append({"fav_prob": fav_prob, "fav_won": fav_won})
        print(f"    close {c1}/{c2} | fair {f1:.0%}/{f2:.0%} | final {s1}-{s2} | fav {favname} {fav_prob:.0%} {'WON' if fav_won else 'lost'}")
    except Exception as e:
        print(f"    ! error: {e}"); skipped += 1; continue

print("\n" + "="*52); print("SANITY CHECK RESULTS"); print("="*52)
n = len(results)
if n == 0:
    print("No games scored. Pipeline problem upstream."); sys.exit(1)
fav_wins = sum(1 for r in results if r["fav_won"])
actual = fav_wins/n; expected = sum(r["fav_prob"] for r in results)/n
print(f"Games scored:            {n}   (skipped {skipped})")
print(f"Favorite win rate:       {actual:.1%}   ({fav_wins}/{n})")
print(f"Expected from prices:    {expected:.1%}")
print(f"Calibration gap:         {actual - expected:+.1%}")
print()
if abs(actual - expected) < 0.08 and 0.46 <= actual <= 0.66:
    print("PASS (provisional): favorites win near the rate the prices imply.")
    print("Pipeline reads reality correctly. Bump MAX_GAMES to 200 for the real read.")
else:
    print("CHECK: outside expected range. Small sample or a bug. Don't trust a backtest yet.")
