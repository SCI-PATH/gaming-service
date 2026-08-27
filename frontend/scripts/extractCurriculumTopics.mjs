import fs from "fs";

const src = fs.readFileSync(
  "D:/RP/frontend-app/src/lib/curriculum/topics.ts",
  "utf8",
);
const re =
  /"topicId":\s*"([^"]+)"[\s\S]*?"grade":\s*(\d+)[\s\S]*?"chapter":\s*(\d+)[\s\S]*?"chapterTitle":\s*"([^"]+)"[\s\S]*?"skillLabel":\s*"([^"]+)"[\s\S]*?"curriculumTitle":\s*"([^"]+)"/g;

const rows = [];
let m;
while ((m = re.exec(src))) {
  rows.push({
    topicId: m[1],
    grade: Number(m[2]),
    chapter: Number(m[3]),
    chapterTitle: m[4],
    skillLabel: m[5],
    curriculumTitle: m[6],
  });
}

const outPath = "D:/Research/gaming-service/frontend/src/data/curriculumTopics.js";
const body = `/**
 * G6–G9 skill catalog mirrored from frontend-app/src/lib/curriculum/topics.ts
 * (canonical IDs used by tutor, quizzes, and farm launch).
 */

export const CURRICULUM_TOPICS = ${JSON.stringify(rows, null, 2)};

const TOPIC_BY_ID = new Map(
  CURRICULUM_TOPICS.map((topic) => [topic.topicId, topic]),
);

/** Derive canonical chapter id, e.g. G6_C7_MAG_POLES → G6_C7. */
export function chapterIdFromTopicId(topicId) {
  if (!topicId) return "";
  const match = String(topicId).trim().match(/^(G[6-9]_C\\d+)/i);
  return match ? match[1].toUpperCase() : "";
}

export function isCurriculumTopicId(value) {
  const id = String(value || "").trim();
  return TOPIC_BY_ID.has(id) || Boolean(id.match(/^G[6-9]_C\\d+(_[A-Z0-9]+)+$/i));
}

export function getCurriculumTopic(topicId) {
  return TOPIC_BY_ID.get(String(topicId || "").trim());
}

export function getCurriculumTitle(topicId) {
  const id = String(topicId || "").trim();
  if (!id) return "";
  return TOPIC_BY_ID.get(id)?.curriculumTitle ?? id;
}

export function compactTopicLabel(topicId) {
  return String(topicId || "").replace(/^G\\d+_/, "");
}
`;

fs.writeFileSync(outPath, body);
console.log(`wrote ${rows.length} topics to ${outPath}`);
