/**
 * APS (Admission Point Score) calculation.
 *
 * A university rule looks like:
 *   {
 *     subjectsCounted: 6,          // how many subjects make up the APS
 *     includeLo: false,            // is Life Orientation counted?
 *     defaultBands: [{ min, max, points }, ...],
 *     subjectBands: { "Life Orientation": [...] },   // optional per-subject scales
 *     mustCount: [["English Home Language", "English First Additional Language"]]
 *   }
 *
 * mustCount and the course's own requirements are lists of "slots". A slot is either a list of
 * alternative subjects, or { subjects, count } meaning "the best `count` of these" (for
 * requirements like 2 of Accounting / Business Studies / Economics). Each slot's best matching
 * subjects are locked in first,
 * then the remaining places are filled with the learner's best other subjects.
 * A learner with exactly 6 non-LO subjects gets the same APS either way: all of them count.
 *
 * Marks are { "Mathematics": 72, "English Home Language": 65, ... } in percent.
 */

export const LIFE_ORIENTATION = 'Life Orientation';

/** Points for one mark on a scale. Returns 0 if no band matches. */
export function pointsFor(mark, bands) {
  const band = bands.find((b) => mark >= b.min && mark <= b.max);
  return band ? Number(band.points) : 0;
}

const byStrength = (a, b) => b.points - a.points || b.mark - a.mark;

/**
 * Compute APS for a learner under one university's rule.
 * `courseSlots` are the course's requirement groups (see slot formats above, optional).
 * Returns { aps, counted: [{ subject, mark, points, locked }] } so the UI can show the working.
 */
export function computeAps(marks, rule, courseSlots = []) {
  const scored = new Map(
    Object.entries(marks)
      .filter(([subject]) => rule.includeLo || subject !== LIFE_ORIENTATION)
      .map(([subject, mark]) => {
        const bands = rule.subjectBands?.[subject] ?? rule.defaultBands;
        return [subject, { subject, mark, points: pointsFor(mark, bands) }];
      }),
  );

  const counted = [];
  const take = (entry, locked) => {
    counted.push({ ...entry, locked });
    scored.delete(entry.subject);
  };

  // 1. Lock in the must-count slots (university rule first, then the course's requirements)
  for (const slot of [...(rule.mustCount ?? []), ...courseSlots]) {
    const { subjects, count } = Array.isArray(slot) ? { subjects: slot, count: 1 } : slot;
    const best = subjects.map((s) => scored.get(s)).filter(Boolean).sort(byStrength).slice(0, count);
    for (const entry of best) {
      if (counted.length >= rule.subjectsCounted) break;
      take(entry, true);
    }
  }

  // 2. Fill the remaining places with the best of the rest
  for (const entry of [...scored.values()].sort(byStrength)) {
    if (counted.length >= rule.subjectsCounted) break;
    take(entry, false);
  }

  const aps = counted.reduce((sum, s) => sum + s.points, 0);
  return { aps, counted };
}
