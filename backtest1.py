#!/usr/bin/env python3
"""Backtest #1 — are FD/DK closing prices +EV vs Pinnacle's sharp close, and do those bets win?"""
import json, time, sys, os, urllib.request
from datetime import datetime

PAUSE = 3.0
RETRY_PAUSE = 8.0
STALE_HOURS = 6
DATE_FROM = "2026-06-12"
DATE_TO   = "2026-06-19"
BASE = "https://api.oddspapi.io/v4"
PROGRESS = "/tmp/backtest1_progress.jsonl"
HEADERS = {"User-Agent": "curl/8.0", "Accept": "application/json"}

KEY = None
try:
    with open(".env.local") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("ODDSPAPI_KEY="):
                KEY = line.split("=", 1)[1].strip(); break
except FileNotFoundError:
    print("ERROR: run from inside ~/pinpoint"); sys.exit(1)
if not KEY:
    print("ERROR: ODDSPAPI_KEY not in .env.local"); sys.exit(1)
print(f"key loaded: {len(KEY)} chars\n")

def api_get(path):
    sep = "&" if "?" in path else "?"
    url = f"{BASE}/{path}{sep}apiKey={KEY}"
    for attempt in range(3):
        try:
            time.sleep(PAUSE if attempt == 0 else RETRY_PAUSE)
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt < 2: continue
            print(f"      ! gave up: {e}"); return None

def parse_dt(s): return datetime.fromisoformat(s.replace("Z", "+00:00"))

def closing_line(book_json, book, start_dt):
    try:
        outs = book_json["bookmakers"][book]["markets"]["131"]["outcomes"]
    except (TypeError, KeyError):
        return None
    out = {}; newest = None
    for oid in ("131", "132"):
        snaps = outs.get(oid, {}).get("players", {}).get("0", [])
        pre = [s for s in snaps if parse_dt(s["createdAt"]) < start_dt]
        if not pre: return None
        last = pre[-1]; out[oid] = last["price"]; ts = parse_dt(last["createdAt"])
        if newest is None or ts > newest: newest = ts
    return out["131"], out["132"], (start_dt - newest).total_seconds()/3600.0

def devig(d1, d2):
    i1, i2 = 1.0/d1, 1.0/d2; t = i1+i2; return i1/t, i2/t

def ev(p, d): return p*(d-1) - (1-p)

print(f"Pulling finished MLB games {DATE_FROM}..{DATE_TO}")
fx = api_get(f"fixtures?sportId=13&from={DATE_FROM}&to={DATE_TO}")
if not isinstance(fx, list):
    print("ERROR: fixtures not a list"); sys.exit(1)
games = [f for f in fx if isinstance(f, dict)
         and f.get("tournamentId") == 109 and f.get("statusName") == "Finished"]
print(f"{len(games)} finished MLB games.\n")

done = set()
if os.path.exists(PROGRESS):
    for ln in open(PROGRESS):
        try: done.add(json.loads(ln)["fid"])
        except Exception: pass
    print(f"resuming: {len(done)} games already processed\n")

out_fh = open(PROGRESS, "a")
for i, g in enumerate(games, 1):
    fid = g.get("fixtureId"); p1 = g.get("participant1Name","team1"); p2 = g.get("participant2Name","team2")
    start = g.get("startTime")
    if fid in done: continue
    print(f"[{i}/{len(games)}] {p1} vs {p2}")
    rec = {"fid": fid, "p1": p1, "p2": p2, "status": None}
    try:
        start_dt = parse_dt(start)
        pin = api_get(f"historical-odds?fixtureId={fid}&bookmakers=pinnacle")
        fd  = api_get(f"historical-odds?fixtureId={fid}&bookmakers=fanduel")
        dk  = api_get(f"historical-odds?fixtureId={fid}&bookmakers=draftkings")
        sc  = api_get(f"scores?fixtureId={fid}")
        pin_c = closing_line(pin, "pinnacle", start_dt)
        if not pin_c:
            rec["status"]="no_pinnacle"; print("    skip: no pinnacle close")
            out_fh.write(json.dumps(rec)+"\n"); out_fh.flush(); continue
        t1, t2 = devig(pin_c[0], pin_c[1])
        try:
            per = sc["scores"]["periods"]; ftt = per.get("fulltime") or per.get("result")
            s1 = ftt["participant1Score"]; s2 = ftt["participant2Score"]
        except (TypeError, KeyError):
            rec["status"]="no_score"; print("    skip: no score")
            out_fh.write(json.dumps(rec)+"\n"); out_fh.flush(); continue
        if s1 == s2:
            rec["status"]="tie"; out_fh.write(json.dumps(rec)+"\n"); out_fh.flush(); continue
        team1_won = s1 > s2
        cands = []
        for book, bj in (("fanduel", fd), ("draftkings", dk)):
            cl = closing_line(bj, book, start_dt)
            if not cl: continue
            d1, d2, stale = cl
            if stale > STALE_HOURS: continue
            for oid, dec, truth, won in (("131",d1,t1,team1_won), ("132",d2,t2,(not team1_won))):
                e = ev(truth, dec)
                if e > 0:
                    cands.append({"book":book,"side":oid,"dec":dec,"truth":truth,"ev":e,"won":won})
        rec.update({"pin131":pin_c[0],"pin132":pin_c[1],"truth131":round(t1,4),"score":f"{s1}-{s2}"})
        if not cands:
            rec["status"]="pass"; print("    pass: no +EV soft price vs Pinnacle")
            out_fh.write(json.dumps(rec)+"\n"); out_fh.flush(); continue
        bet = max(cands, key=lambda c: c["ev"])
        profit = (bet["dec"]-1) if bet["won"] else -1.0
        rec.update({"status":"bet","book":bet["book"],"side":bet["side"],"dec":bet["dec"],
                    "ev":round(bet["ev"]*100,2),"won":bet["won"],"profit":round(profit,4),"n_cands":len(cands)})
        team = p1 if bet["side"]=="131" else p2
        print(f"    BET {team} @ {bet['dec']} ({bet['book']}) EV {bet['ev']*100:.1f}% -> {'WON' if bet['won'] else 'lost'} ({profit:+.2f}u)")
        out_fh.write(json.dumps(rec)+"\n"); out_fh.flush()
    except Exception as e:
        rec["status"]=f"error:{e}"; print(f"    error: {e}")
        out_fh.write(json.dumps(rec)+"\n"); out_fh.flush()
out_fh.close()

rows = [json.loads(ln) for ln in open(PROGRESS)]
bets = [r for r in rows if r.get("status")=="bet"]
passes = [r for r in rows if r.get("status")=="pass"]
skips = [r for r in rows if r.get("status") not in ("bet","pass")]
print("\n" + "="*56)
print("BACKTEST #1 RESULTS  (Pinnacle truth, bet FD/DK +EV spots)")
print("="*56)
print(f"Games processed:   {len(rows)}")
print(f"  bets placed:     {len(bets)}")
print(f"  passes (no +EV): {len(passes)}")
print(f"  skipped (data):  {len(skips)}")
if bets:
    wins = sum(1 for b in bets if b["won"]); profit = sum(b["profit"] for b in bets)
    print(f"\nRecord:            {wins}-{len(bets)-wins}   ({wins/len(bets):.1%})")
    print(f"Total profit:      {profit:+.2f} units (1u flat)")
    print(f"ROI:               {profit/len(bets)*100:+.1f}% per bet")
    print("\nBy edge size:")
    for lo, hi in [(0,1),(1,2),(2,3),(3,5),(5,100)]:
        seg = [b for b in bets if lo <= b["ev"] < hi]
        if seg:
            w = sum(1 for b in seg if b["won"]); pr = sum(b["profit"] for b in seg)
            print(f"  EV {lo}-{hi}%:  {len(seg):2d} bets  {w}-{len(seg)-w}  {pr:+.2f}u  ({pr/len(seg)*100:+.1f}% ROI)")
    print("\nCAVEATS: 2-book soft side (not the live 5); only spots where FD/DK")
    print("closed looser than Pinnacle. Small n by bucket — read directionally.")
else:
    print("\nNo bets flagged. Soft books never closed looser than Pinnacle here —")
    print("which itself is a finding: no exploitable gap at the close in this window.")
