import { americanToImpliedProb } from "./ev"

// Power method: find k such that impliedA^k + impliedB^k = 1. Unlike proportional
// normalization, this removes more margin from the longshot (favorite-longshot bias).
function solvePowerK(impliedA: number, impliedB: number): number {
  // f(k) = a^k + b^k - 1 is strictly decreasing for a, b in (0, 1), with f(0) = 1.
  const f = (k: number) => Math.pow(impliedA, k) + Math.pow(impliedB, k) - 1
  let lo = 0
  let hi = 1
  while (f(hi) > 0 && hi < 1e6) hi *= 2
  for (let i = 0; i < 100 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function devig(oddsA: number, oddsB: number): { probA: number; probB: number } {
  const impliedA = americanToImpliedProb(oddsA)
  const impliedB = americanToImpliedProb(oddsB)

  let probA: number
  let probB: number
  const validA = impliedA > 0 && impliedA < 1
  const validB = impliedB > 0 && impliedB < 1
  if (validA && validB) {
    const k = solvePowerK(impliedA, impliedB)
    probA = Math.pow(impliedA, k)
    probB = Math.pow(impliedB, k)
  } else if (impliedA >= 1 && impliedB < 1) {
    // Limit of the power method as one side approaches certainty
    probA = 1
    probB = 0
  } else if (impliedB >= 1 && impliedA < 1) {
    probA = 0
    probB = 1
  } else {
    // A side at 0 (power limit gives the other side 1) or both degenerate: proportional
    const total = impliedA + impliedB
    probA = impliedA / total
    probB = impliedB / total
  }

  return {
    probA: Math.round(probA * 1000) / 1000,
    probB: Math.round(probB * 1000) / 1000,
  }
}

export function vigPercent(oddsA: number, oddsB: number): number {
  const total = americanToImpliedProb(oddsA) + americanToImpliedProb(oddsB)
  return Math.round((total - 1) * 1000) / 10
}
