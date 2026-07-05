// Paint quantity + cost estimation. Pure maths, decoupled from the shade catalog
// and DOM so it can be reused (and tested) independently of the preview UI.

// Standard-room defaults: ~40 sq m of wall over 2 coats, ~11 sq m covered per
// litre. Override any of these for a specific job.
export const DEFAULT_ROOM_SQ_M = 40;
export const DEFAULT_COVERAGE_SQ_M_PER_L = 11;
export const DEFAULT_COATS = 2;

// Returns the litres required and total cost for painting `roomSqM` of wall with
// `coats` coats of a paint priced at `pricePerL`. Litres are rounded up to whole
// tins, matching how paint is actually sold. Returns null when no price is known.
export function estimatePaint({
  pricePerL,
  roomSqM = DEFAULT_ROOM_SQ_M,
  coveragePerL = DEFAULT_COVERAGE_SQ_M_PER_L,
  coats = DEFAULT_COATS,
} = {}) {
  if (!pricePerL || pricePerL <= 0) return null;
  if (!coveragePerL || coveragePerL <= 0) return null;

  const litres = Math.ceil((roomSqM * coats) / coveragePerL);
  return {
    litres,
    pricePerL,
    coats,
    roomSqM,
    coveragePerL,
    totalInr: litres * pricePerL,
  };
}
