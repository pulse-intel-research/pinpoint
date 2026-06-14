import { americanToImpliedProb } from "./ev"

export function devig(oddsA: number, oddsB: number): { probA: number; probB: number } {
  const impliedA = americanToImpliedProb(oddsA)
  const impliedB = americanToImpliedProb(oddsB)
  const total = impliedA + impliedB
  return {
    probA: Math.round((impliedA / total) * 1000) / 1000,
    probB: Math.round((impliedB / total) * 1000) / 1000,
  }
}

export function vigPercent(oddsA: number, oddsB: number): number {
  const total = americanToImpliedProb(oddsA) + americanToImpliedProb(oddsB)
  return Math.round((total - 1) * 1000) / 10
}
