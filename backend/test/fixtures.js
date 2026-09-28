/**
 * Test fixtures modelled on real UJ and WSU 2027 data.
 */
const NSC_7 = [
  { min: 80, max: 100, points: 7 }, { min: 70, max: 79, points: 6 }, { min: 60, max: 69, points: 5 },
  { min: 50, max: 59, points: 4 }, { min: 40, max: 49, points: 3 }, { min: 30, max: 39, points: 2 },
  { min: 0, max: 29, points: 1 },
];
const WSU_8 = [{ min: 90, max: 100, points: 8 }, { min: 80, max: 89, points: 7 }, ...NSC_7.slice(1)];

export const RULES = {
  UJ: { subjectsCounted: 6, includeLo: false, defaultBands: NSC_7, subjectBands: {} },
  WSU: { subjectsCounted: 6, includeLo: false, defaultBands: WSU_8, subjectBands: {} },
};

const english = (pct) => ({
  description: 'English',
  options: [
    { subject: 'English Home Language', minPercent: pct },
    { subject: 'English First Additional Language', minPercent: pct },
  ],
});
const group = (description, ...opts) => ({
  description,
  options: opts.map(([subject, minPercent]) => ({ subject, minPercent })),
});

const course = (over) => ({
  courseId: 1, faculty: 'Test', notes: null, minApsMathsLit: null, minApsTechMaths: null, ...over,
});

export const BENG_CIVIL = course({
  courseId: 101, name: 'BEng Civil Engineering', universityShortName: 'UJ', minAps: 32, minApsTechMaths: 32,
  requirements: [english(60), group('Mathematics', ['Mathematics', 60], ['Technical Mathematics', 60]),
    group('Physical Sciences', ['Physical Sciences', 60])],
});

export const BENGTECH_CIVIL = course({
  courseId: 102, name: 'BEngTech Civil Engineering', universityShortName: 'UJ', minAps: 28, minApsTechMaths: 28,
  requirements: [english(50), group('Mathematics', ['Mathematics', 60], ['Technical Mathematics', 60]),
    group('Science', ['Physical Sciences', 60], ['Technical Sciences', 60])],
});

export const BCOM_INFO_MGMT = course({
  courseId: 103, name: 'BCom Information Management', universityShortName: 'UJ', minAps: null, minApsMathsLit: 28,
  requirements: [english(50), group('Mathematics', ['Mathematics', 50], ['Mathematical Literacy', 70],
    ['Technical Mathematics', 50])],
});

export const BED_FOUNDATION = course({
  courseId: 104, name: 'BEd Foundation Phase', universityShortName: 'UJ', minAps: 28, minApsMathsLit: 28, minApsTechMaths: 28,
  requirements: [group('English', ['English Home Language', 60], ['English First Additional Language', 70]),
    group('Mathematics', ['Mathematics', 40], ['Mathematical Literacy', 60], ['Technical Mathematics', 60])],
});

export const WSU_BCOM = course({
  courseId: 201, name: 'Bachelor of Commerce', universityShortName: 'WSU', minAps: 25, minApsMathsLit: 25,
  requirements: [english(50), group('Mathematics', ['Mathematics', 40], ['Mathematical Literacy', 60])],
});

/** Strong science learner: APS at UJ = 7+6+6+6+5+5 = 35 (LO excluded). */
export const SCIENCE_LEARNER = {
  'English Home Language': 72,
  'isiZulu First Additional Language': 81,
  Mathematics: 75,
  'Physical Sciences': 68,
  'Life Sciences': 70,
  Geography: 64,
  'Life Orientation': 90,
};
