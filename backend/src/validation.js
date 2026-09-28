/**
 * Validation for learner marks sent to the API.
 * Returns a list of human-readable errors (empty = valid).
 */
import { MATHEMATICS, MATHS_LIT, TECH_MATHS } from './eligibility.js';

const MATHS_SUBJECTS = [MATHEMATICS, MATHS_LIT, TECH_MATHS];
const MAX_SUBJECTS = 12;

export function validateMarks(marks, knownSubjects) {
  if (marks === null || typeof marks !== 'object' || Array.isArray(marks)) {
    return ['"marks" must be an object like { "Mathematics": 65, "English Home Language": 70 }.'];
  }
  const entries = Object.entries(marks);
  if (entries.length === 0) return ['Enter at least one subject.'];
  if (entries.length > MAX_SUBJECTS) return [`Too many subjects (maximum ${MAX_SUBJECTS}).`];

  const errors = [];
  for (const [subject, mark] of entries) {
    if (!knownSubjects.has(subject)) errors.push(`Unknown subject: "${subject}".`);
    if (!Number.isInteger(mark) || mark < 0 || mark > 100) {
      errors.push(`Mark for "${subject}" must be a whole number from 0 to 100.`);
    }
  }

  const maths = MATHS_SUBJECTS.filter((s) => s in marks);
  if (maths.length > 1) errors.push(`Choose only one maths subject (got ${maths.join(', ')}).`);

  // The same language can't be taken at both Home Language and First Additional Language level.
  for (const subject of Object.keys(marks)) {
    if (subject.endsWith(' Home Language')) {
      const fal = subject.replace(' Home Language', ' First Additional Language');
      if (fal in marks) errors.push(`"${subject}" and "${fal}" can't both be taken.`);
    }
  }
  return errors;
}
