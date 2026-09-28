/**
 * APS (Admission Point Score) calculation.
 *
 * A university rule looks like:
 *   {
 *     subjectsCounted: 6,          // best N subjects
 *     includeLo: false,            // is Life Orientation counted?
 *     defaultBands: [{ min, max, points }, ...],
 *     subjectBands: { "Life Orientation": [...] }   // optional per-subject scales
 *   }
 * Marks are { "Mathematics": 72, "English Home Language": 65, ... } in percent.
 */

export const LIFE_ORIENTATION = 'Life Orientation';

/** Points for one mark on a scale. Returns 0 if no band matches. */
export function pointsFor(mark, bands) {
  const band = bands.find((b) => mark >= b.min && mark <= b.max);
  return band ? Number(band.points) : 0;
}

/**
 * Compute APS for a learner under one university's rule.
 * Returns { aps, counted: [{ subject, mark, points }] } so the UI can show the working.
 */
export function computeAps(marks, rule) {
  const scored = Object.entries(marks)
    .filter(([subject]) => rule.includeLo || subject !== LIFE_ORIENTATION)
    .map(([subject, mark]) => {
      const bands = rule.subjectBands?.[subject] ?? rule.defaultBands;
      return { subject, mark, points: pointsFor(mark, bands) };
    })
    .sort((a, b) => b.points - a.points || b.mark - a.mark);

  const counted = scored.slice(0, rule.subjectsCounted);
  const aps = counted.reduce((sum, s) => sum + s.points, 0);
  return { aps, counted };
}
