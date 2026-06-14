export function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

export function calculateEV(modelProb: number, americanOdds: number): number {
  const implied = americanToImpliedProb(americanOdds)
  const decimal = americanOdds > 0 ? americanOdds / 100 + 1 : 100 / Math.abs(americanOdds) + 1
  const ev = modelProb * (decimal - 1) - (1 - modelProb)
  return Math.round(ev * 1000) / 10
}

export function edgePercent(modelProb: number, americanOdds: number): number {
  const implied = americanToImpliedProb(americanOdds)
  return Math.round((modelProb - implied) * 1000) / 10
}
