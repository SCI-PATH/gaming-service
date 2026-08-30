/**
 * Official Grade 6–9 Science chapter map (EduPub English).
 *
 * Page ranges are 1-based PDF viewer pages, matching the assessment-engine
 * ingest (curriculum.yaml). Part 1 / Part 2 page numbers are never mixed.
 *
 * chapter_id  — sequential id Sage uses (G6_C01 …)
 * topic_id    — skill-hierarchy id used by assessment / learning-path
 * lesson_id   — learning-path lesson id
 */
export const TEXTBOOK_SOURCES = [
  {
    grade: 6,
    pdf_id: 'part1',
    filename: 'science G-6 E.pdf',
    local_names: ['science G-6 E.pdf', 'grade_6_science.pdf'],
    url: 'http://www.edupub.gov.lk/Administrator/English/6/science%20G-6%20%20E/science%20G-6%20E.pdf',
  },
  {
    grade: 7,
    pdf_id: 'part1',
    filename: 'science G-7 P-I E.pdf',
    local_names: ['science G-7 P-I E.pdf', 'grade_7_science_part1.pdf'],
    url: 'http://www.edupub.gov.lk/Administrator/English/7/science%20G-7%20P-I%20E/science%20G-7%20P-I%20E.pdf',
  },
  {
    grade: 7,
    pdf_id: 'part2',
    filename: 'science G-7 P-II E.pdf',
    local_names: ['science G-7 P-II E.pdf', 'grade_7_science_part2.pdf'],
    url: '',
  },
  {
    grade: 8,
    pdf_id: 'part1',
    filename: 'science G8 P-I E.pdf',
    local_names: ['science G8 P-I E.pdf', 'grade_8_science_part1.pdf'],
    url: 'http://www.edupub.gov.lk/Administrator/English/8/science%20G-8%20P-I%20E/science%20G8%20P-I%20E.pdf',
  },
  {
    grade: 8,
    pdf_id: 'part2',
    filename: 'science G-8 P-II E.pdf',
    local_names: ['science G-8 P-II E.pdf', 'grade_8_science_part2.pdf'],
    url: 'http://www.edupub.gov.lk/Administrator/English/8/science%20G-8%20P-II%20E/science%20G-8%20P-II%20E.pdf',
  },
  {
    grade: 9,
    pdf_id: 'part1',
    filename: 'science G-9 P-I E.pdf',
    local_names: ['science G-9 P-I E.pdf', 'grade_9_science_part1.pdf'],
    url: 'http://www.edupub.gov.lk/Administrator/English/9/science%20G-9%20P-I%20E/science%20G-9%20P-I%20E.pdf',
  },
  {
    grade: 9,
    pdf_id: 'part2',
    filename: 'Science Part II English G-9.pdf',
    local_names: ['Science Part II English G-9.pdf', 'grade_9_science_part2.pdf'],
    url: 'http://www.edupub.gov.lk/Administrator/English/9/science%20G-9%20P-II%20E/Science%20Part%20II%20English%20G-9.pdf',
  },
];

/** chunk_size / overlap match iae.infrastructure.rag.pdf_loader */
export const CHUNK_SIZE = 900;
export const CHUNK_OVERLAP = 150;
export const MIN_CHUNK_CHARS = 80;

export const CURRICULUM_CHAPTERS = [
  { grade: 6, index: 1, chapter_id: 'G6_C01', lesson_id: 'g6_sci_01', topic_id: 'G6_S1_ORG_CHARS', chapter_name: 'Wonders of the Living World', pdf_id: 'part1', page_start: 15, page_end: 34 },
  { grade: 6, index: 2, chapter_id: 'G6_C02', lesson_id: 'g6_sci_02', topic_id: 'G6_S2_MAT_STATES', chapter_name: 'Things Around Us', pdf_id: 'part1', page_start: 35, page_end: 48 },
  { grade: 6, index: 3, chapter_id: 'G6_C03', lesson_id: 'g6_sci_03', topic_id: 'G6_S3_WAT_RESOUR', chapter_name: 'Water as a Natural Resource', pdf_id: 'part1', page_start: 49, page_end: 62 },
  { grade: 6, index: 4, chapter_id: 'G6_C04', lesson_id: 'g6_sci_04', topic_id: 'G6_S4_ENE_SOURCES', chapter_name: 'Energy in Day-to-Day Life', pdf_id: 'part1', page_start: 63, page_end: 80 },
  { grade: 6, index: 5, chapter_id: 'G6_C05', lesson_id: 'g6_sci_05', topic_id: 'G6_S5_LIG_VISION', chapter_name: 'Light and Vision', pdf_id: 'part1', page_start: 81, page_end: 100 },
  { grade: 6, index: 6, chapter_id: 'G6_C06', lesson_id: 'g6_sci_06', topic_id: 'G6_S6_SOU_HEARING', chapter_name: 'Sound and Hearing', pdf_id: 'part1', page_start: 101, page_end: 112 },
  { grade: 6, index: 7, chapter_id: 'G6_C07', lesson_id: 'g6_sci_07', topic_id: 'G6_S7_MAG_POLES', chapter_name: 'Magnets', pdf_id: 'part1', page_start: 113, page_end: 123 },
  { grade: 6, index: 8, chapter_id: 'G6_C08', lesson_id: 'g6_sci_08', topic_id: 'G6_S8_ELE_CIRCUITS', chapter_name: 'Electricity for a Comfortable Life', pdf_id: 'part1', page_start: 124, page_end: 146 },
  { grade: 6, index: 9, chapter_id: 'G6_C09', lesson_id: 'g6_sci_09', topic_id: 'G6_S9_HEA_EFFECTS', chapter_name: 'Heat and Its Effects', pdf_id: 'part1', page_start: 147, page_end: 161 },
  { grade: 6, index: 10, chapter_id: 'G6_C10', lesson_id: 'g6_sci_10', topic_id: 'G6_S10_FOO_INTERAC', chapter_name: 'Food-related Interactions', pdf_id: 'part1', page_start: 162, page_end: 172 },
  { grade: 6, index: 11, chapter_id: 'G6_C11', lesson_id: 'g6_sci_11', topic_id: 'G6_S11_WEA_CLIMATE', chapter_name: 'Weather and Climate', pdf_id: 'part1', page_start: 173, page_end: 190 },

  { grade: 7, index: 1, chapter_id: 'G7_C01', lesson_id: 'g7_sci_01', topic_id: 'G7_S1_PLA_DIVER', chapter_name: 'Plant Diversity', pdf_id: 'part1', page_start: 13, page_end: 33 },
  { grade: 7, index: 2, chapter_id: 'G7_C02', lesson_id: 'g7_sci_02', topic_id: 'G7_S2_STA_CHARGES', chapter_name: 'Static Electricity', pdf_id: 'part1', page_start: 34, page_end: 45 },
  { grade: 7, index: 3, chapter_id: 'G7_C03', lesson_id: 'g7_sci_03', topic_id: 'G7_S3_ELE_SOURCES', chapter_name: 'Generation of Electricity', pdf_id: 'part1', page_start: 46, page_end: 65 },
  { grade: 7, index: 4, chapter_id: 'G7_C04', lesson_id: 'g7_sci_04', topic_id: 'G7_S4_WAT_SOLVENT', chapter_name: 'Functions of Water', pdf_id: 'part1', page_start: 66, page_end: 74 },
  { grade: 7, index: 5, chapter_id: 'G7_C05', lesson_id: 'g7_sci_05', topic_id: 'G7_S5_ACI_IDENTIF', chapter_name: 'Acids and Bases', pdf_id: 'part1', page_start: 75, page_end: 83 },
  { grade: 7, index: 6, chapter_id: 'G7_C06', lesson_id: 'g7_sci_06', topic_id: 'G7_S6_ANI_CLASSIF', chapter_name: 'Animal Diversity', pdf_id: 'part1', page_start: 84, page_end: 98 },
  { grade: 7, index: 7, chapter_id: 'G7_C07', lesson_id: 'g7_sci_07', topic_id: 'G7_S7_ENE_FORMS', chapter_name: 'Forms of Energy and Uses', pdf_id: 'part1', page_start: 99, page_end: 116 },
  { grade: 7, index: 8, chapter_id: 'G7_C08', lesson_id: 'g7_sci_08', topic_id: 'G7_S8_EAR_STRUCT', chapter_name: 'The Nature of the Earth', pdf_id: 'part1', page_start: 117, page_end: 126 },
  { grade: 7, index: 9, chapter_id: 'G7_C09', lesson_id: 'g7_sci_09', topic_id: 'G7_S9_LIG_SHADOWS', chapter_name: 'Light', pdf_id: 'part1', page_start: 127, page_end: 149 },
  { grade: 7, index: 10, chapter_id: 'G7_C10', lesson_id: 'g7_sci_10', topic_id: 'G7_S10_MIC_LIGHT', chapter_name: 'The Correct Use of the Microscope', pdf_id: 'part1', page_start: 150, page_end: 160 },
  { grade: 7, index: 11, chapter_id: 'G7_C11', lesson_id: 'g7_sci_11', topic_id: 'G7_S11_SOU_PROPAG', chapter_name: 'Sound', pdf_id: 'part2', page_start: 13, page_end: 22 },
  { grade: 7, index: 12, chapter_id: 'G7_C12', lesson_id: 'g7_sci_12', topic_id: 'G7_S12_BIO_PROCESS', chapter_name: 'Biological Processes', pdf_id: 'part2', page_start: 23, page_end: 39 },
  { grade: 7, index: 13, chapter_id: 'G7_C13', lesson_id: 'g7_sci_13', topic_id: 'G7_S13_ATM_LAYERS', chapter_name: 'Atmosphere', pdf_id: 'part2', page_start: 40, page_end: 51 },
  { grade: 7, index: 14, chapter_id: 'G7_C14', lesson_id: 'g7_sci_14', topic_id: 'G7_S14_HEA_TEMPER', chapter_name: 'Heat and Temperature', pdf_id: 'part2', page_start: 52, page_end: 70 },
  { grade: 7, index: 15, chapter_id: 'G7_C15', lesson_id: 'g7_sci_15', topic_id: 'G7_S15_SOI_TYPES', chapter_name: 'Soil', pdf_id: 'part2', page_start: 71, page_end: 84 },
  { grade: 7, index: 16, chapter_id: 'G7_C16', lesson_id: 'g7_sci_16', topic_id: 'G7_S16_FOR_MOTION', chapter_name: 'Force and Motion', pdf_id: 'part2', page_start: 85, page_end: 97 },
  { grade: 7, index: 17, chapter_id: 'G7_C17', lesson_id: 'g7_sci_17', topic_id: 'G7_S17_FOO_NUTRIEN', chapter_name: 'Nutrients in Food', pdf_id: 'part2', page_start: 98, page_end: 111 },
  { grade: 7, index: 18, chapter_id: 'G7_C18', lesson_id: 'g7_sci_18', topic_id: 'G7_S18_MIN_ROCKS', chapter_name: 'Minerals and Rocks', pdf_id: 'part2', page_start: 112, page_end: 124 },
  { grade: 7, index: 19, chapter_id: 'G7_C19', lesson_id: 'g7_sci_19', topic_id: 'G7_S19_ENE_SOURCES', chapter_name: 'Sources of Energy', pdf_id: 'part2', page_start: 125, page_end: 140 },

  { grade: 8, index: 1, chapter_id: 'G8_C01', lesson_id: 'g8_sci_01', topic_id: 'G8_S1_BIO_DIVER', chapter_name: 'Importance of Microorganisms', pdf_id: 'part1', page_start: 11, page_end: 21 },
  { grade: 8, index: 2, chapter_id: 'G8_C02', lesson_id: 'g8_sci_02', topic_id: 'G8_S2_ANI_CLASSIF', chapter_name: 'Animal Classification', pdf_id: 'part1', page_start: 22, page_end: 33 },
  { grade: 8, index: 3, chapter_id: 'G8_C03', lesson_id: 'g8_sci_03', topic_id: 'G8_S3_PLA_PARTS', chapter_name: 'Diversity and Functions of Plant Parts', pdf_id: 'part1', page_start: 34, page_end: 48 },
  { grade: 8, index: 4, chapter_id: 'G8_C04', lesson_id: 'g8_sci_04', topic_id: 'G8_S4_MAT_ELEMENTS', chapter_name: 'Properties of Matter', pdf_id: 'part1', page_start: 49, page_end: 71 },
  { grade: 8, index: 5, chapter_id: 'G8_C05', lesson_id: 'g8_sci_05', topic_id: 'G8_S5_SOU_WAVES', chapter_name: 'Sound', pdf_id: 'part1', page_start: 72, page_end: 87 },
  { grade: 8, index: 6, chapter_id: 'G8_C06', lesson_id: 'g8_sci_06', topic_id: 'G8_S6_MAG_FORCE', chapter_name: 'Magnets', pdf_id: 'part1', page_start: 88, page_end: 104 },
  { grade: 8, index: 7, chapter_id: 'G8_C07', lesson_id: 'g8_sci_07', topic_id: 'G8_S7_ELE_MEASURE', chapter_name: 'Measurements Associated with Electricity', pdf_id: 'part1', page_start: 105, page_end: 116 },
  { grade: 8, index: 8, chapter_id: 'G8_C08', lesson_id: 'g8_sci_08', topic_id: 'G8_S8_CHA_PHYSICAL', chapter_name: 'Changes in Matter', pdf_id: 'part1', page_start: 117, page_end: 137 },
  { grade: 8, index: 9, chapter_id: 'G8_C09', lesson_id: 'g8_sci_09', topic_id: 'G8_S9_SYS_HUMAN', chapter_name: 'Human Organ Systems', pdf_id: 'part2', page_start: 11, page_end: 27 },
  { grade: 8, index: 10, chapter_id: 'G8_C10', lesson_id: 'g8_sci_10', topic_id: 'G8_S10_ELE_CIRCUIT', chapter_name: 'Electricity', pdf_id: 'part2', page_start: 28, page_end: 55 },
  { grade: 8, index: 11, chapter_id: 'G8_C11', lesson_id: 'g8_sci_11', topic_id: 'G8_S11_PHO_PROCESS', chapter_name: 'Main Biological Processes in Plants', pdf_id: 'part2', page_start: 66, page_end: 71 },
  { grade: 8, index: 12, chapter_id: 'G8_C12', lesson_id: 'g8_sci_12', topic_id: 'G8_S12_LIF_CYCLES', chapter_name: 'Life Cycles of Living Organisms', pdf_id: 'part2', page_start: 72, page_end: 89 },
  { grade: 8, index: 13, chapter_id: 'G8_C13', lesson_id: 'g8_sci_13', topic_id: 'G8_S13_FOO_PRESERV', chapter_name: 'Food Preservation', pdf_id: 'part2', page_start: 90, page_end: 106 },
  { grade: 8, index: 14, chapter_id: 'G8_C14', lesson_id: 'g8_sci_14', topic_id: 'G8_S14_SOL_SYSTEM', chapter_name: 'Solar System Phenomena', pdf_id: 'part2', page_start: 107, page_end: 137 },
  { grade: 8, index: 15, chapter_id: 'G8_C15', lesson_id: 'g8_sci_15', topic_id: 'G8_S15_DIS_NATURAL', chapter_name: 'Natural Disasters', pdf_id: 'part2', page_start: 138, page_end: 152 },

  { grade: 9, index: 1, chapter_id: 'G9_C01', lesson_id: 'g9_sci_01', topic_id: 'G9_S1_MIC_APPLIC', chapter_name: 'Applications of Micro-organisms', pdf_id: 'part1', page_start: 13, page_end: 27 },
  { grade: 9, index: 2, chapter_id: 'G9_C02', lesson_id: 'g9_sci_02', topic_id: 'G9_S2_SEN_EYE', chapter_name: 'Eye and Ear', pdf_id: 'part1', page_start: 28, page_end: 49 },
  { grade: 9, index: 3, chapter_id: 'G9_C03', lesson_id: 'g9_sci_03', topic_id: 'G9_S3_NAT_ATOMS', chapter_name: 'Nature and Properties of Matter', pdf_id: 'part1', page_start: 50, page_end: 63 },
  { grade: 9, index: 4, chapter_id: 'G9_C04', lesson_id: 'g9_sci_04', topic_id: 'G9_S4_FOR_BASIC', chapter_name: 'Basic Concepts Associated with Force', pdf_id: 'part1', page_start: 64, page_end: 83 },
  { grade: 9, index: 5, chapter_id: 'G9_C05', lesson_id: 'g9_sci_05', topic_id: 'G9_S6_SYS_CIRCUL', chapter_name: 'The Human Circulatory System', pdf_id: 'part1', page_start: 84, page_end: 94 },
  { grade: 9, index: 6, chapter_id: 'G9_C06', lesson_id: 'g9_sci_06', topic_id: 'G9_S7_PLA_GROWTH', chapter_name: 'Plant Growth Substances', pdf_id: 'part1', page_start: 95, page_end: 100 },
  { grade: 9, index: 7, chapter_id: 'G9_C07', lesson_id: 'g9_sci_07', topic_id: 'G9_S8_ORG_SUPPORT', chapter_name: 'Support and Movements of Organisms', pdf_id: 'part1', page_start: 101, page_end: 109 },
  { grade: 9, index: 8, chapter_id: 'G9_C08', lesson_id: 'g9_sci_08', topic_id: 'G9_S9_EVO_PROCESS', chapter_name: 'The Evolutionary Process', pdf_id: 'part1', page_start: 110, page_end: 222 },
  { grade: 9, index: 9, chapter_id: 'G9_C09', lesson_id: 'g9_sci_09', topic_id: 'G9_S10_ELE_LYSIS', chapter_name: 'Electrolysis', pdf_id: 'part2', page_start: 13, page_end: 21 },
  { grade: 9, index: 10, chapter_id: 'G9_C10', lesson_id: 'g9_sci_10', topic_id: 'G9_S11_MAT_DENSITY', chapter_name: 'Density', pdf_id: 'part2', page_start: 22, page_end: 30 },
  { grade: 9, index: 11, chapter_id: 'G9_C11', lesson_id: 'g9_sci_11', topic_id: 'G9_S12_BIO_DIVER', chapter_name: 'Bio-diversity', pdf_id: 'part2', page_start: 31, page_end: 53 },
  { grade: 9, index: 12, chapter_id: 'G9_C12', lesson_id: 'g9_sci_12', topic_id: 'G9_S13_ENV_GREEN', chapter_name: 'Artificial Environment and Green Concept', pdf_id: 'part2', page_start: 54, page_end: 69 },
  { grade: 9, index: 13, chapter_id: 'G9_C13', lesson_id: 'g9_sci_13', topic_id: 'G9_S14_LIG_REFRAC', chapter_name: 'Reflection and Refraction of Waves', pdf_id: 'part2', page_start: 70, page_end: 95 },
  { grade: 9, index: 14, chapter_id: 'G9_C14', lesson_id: 'g9_sci_14', topic_id: 'G9_S15_MAC_SIMPLE', chapter_name: 'Simple Machines', pdf_id: 'part2', page_start: 96, page_end: 114 },
  { grade: 9, index: 15, chapter_id: 'G9_C15', lesson_id: 'g9_sci_15', topic_id: 'G9_S16_NAN_TECH', chapter_name: 'Nanotechnology and its Applications', pdf_id: 'part2', page_start: 115, page_end: 130 },
  { grade: 9, index: 16, chapter_id: 'G9_C16', lesson_id: 'g9_sci_16', topic_id: 'G9_S17_LIG_ACCIDEN', chapter_name: 'Lightning Accidents', pdf_id: 'part2', page_start: 131, page_end: 140 },
  { grade: 9, index: 17, chapter_id: 'G9_C17', lesson_id: 'g9_sci_17', topic_id: 'G9_S18_DIS_NATURAL', chapter_name: 'Natural Disasters', pdf_id: 'part2', page_start: 141, page_end: 163 },
  { grade: 9, index: 18, chapter_id: 'G9_C18', lesson_id: 'g9_sci_18', topic_id: 'G9_S19_NAT_SUSTAIN', chapter_name: 'Sustainable Use of Natural Resources', pdf_id: 'part2', page_start: 164, page_end: 180 },
];

export function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function chapterForPage(grade, pdfId, page) {
  return (
    CURRICULUM_CHAPTERS.find(
      (c) =>
        c.grade === Number(grade) &&
        c.pdf_id === pdfId &&
        page >= c.page_start &&
        page <= c.page_end,
    ) || null
  );
}

export function resolveChapter(miss = {}) {
  const grade = Number(String(miss.grade || '').replace(/.*?(\d).*/, '$1')) || 0;
  const topicId = String(miss.topic_id || miss.topicId || '').trim();
  const chapterId = String(miss.chapter_id || miss.chapterId || '').trim();
  const name = normalizeTitle(
    miss.chapter_name || miss.chapter || miss.topic || '',
  );
  if (chapterId) {
    const hit = CURRICULUM_CHAPTERS.find((c) => c.chapter_id === chapterId);
    if (hit) return hit;
  }
  if (topicId) {
    const hit = CURRICULUM_CHAPTERS.find((c) => c.topic_id === topicId);
    if (hit) return hit;
  }
  const pool = grade
    ? CURRICULUM_CHAPTERS.filter((c) => c.grade === grade)
    : CURRICULUM_CHAPTERS;
  if (name) {
    const exact = pool.find((c) => normalizeTitle(c.chapter_name) === name);
    if (exact) return exact;
    const loose = pool.find(
      (c) =>
        normalizeTitle(c.chapter_name).includes(name) ||
        name.includes(normalizeTitle(c.chapter_name)),
    );
    if (loose) return loose;
  }
  return null;
}
