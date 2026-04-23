/**
 * Mapování číselné sazby DPH na hodnotu inv:rateVAT podle konvence POHODY (zjednodušeně).
 */
export function pohodaRateVatFromPercent(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) {
    return "high";
  }
  if (percent <= 0) {
    return "none";
  }
  if (percent >= 20) {
    return "high";
  }
  return "low";
}
