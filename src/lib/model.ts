import type { Paper, Topic, Question, Explanation } from "../generated/content";
export type { Paper, Topic, Question, Explanation };
export interface Entry {
  id: string;
  paperId: string;
  number: number;
  topicId: string;
  revision: number;
  assessmentRevision: number;
  legalStatus: string;
  explanationStatus: string;
  sourceVerified: boolean;
}
export interface Chunk {
  topicId: string;
  path: string;
  sha256: string;
  count: number;
}
export interface Catalog {
  schemaVersion: 1;
  releaseId: string;
  papers: Paper[];
  topics: Topic[];
  entries: Entry[];
  chunks: Chunk[];
  createdAt: string;
  counts: { questions: number; verified: number; sourceVerified: number };
  assets?: Record<string, { path: string; sha256: string; purpose: string }>;
}
export interface TopicContent {
  questions: Question[];
  explanations: Explanation[];
}
export type Familiarity = "keep" | "unsure" | "known";
export interface Highlight {
  id: string;
  questionId: string;
  blockId: string;
  text: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  revision: number;
  color: "yellow" | "pink";
}
export interface ReadingRecord {
  state: Familiarity;
  read: boolean;
  assessmentRevision: number;
}
export interface Filters {
  grade: string;
  exam: string;
  year: string;
  topic: string;
  order: "topic" | "paper";
  includeChanged: boolean;
  onlyUnsure: boolean;
}
export interface StudyState {
  version: 1;
  cycle: number;
  cycleIds: string[];
  cycleRelease: string;
  currentId: string;
  records: Record<string, ReadingRecord>;
  highlights: Highlight[];
  mode: "continuous" | "single";
  fontSize: 16 | 18 | 20;
  hideAnswers: boolean;
  collapseKnown: boolean;
  onlyHighlights: boolean;
  filters: Filters;
  updatedAt: string;
}
export const defaultFilters: Filters = {
  grade: "all",
  exam: "all",
  year: "all",
  topic: "all",
  order: "topic",
  includeChanged: false,
  onlyUnsure: false,
};
export const defaultStudy = (): StudyState => ({
  version: 1,
  cycle: 1,
  cycleIds: [],
  cycleRelease: "",
  currentId: "",
  records: {},
  highlights: [],
  mode: "continuous",
  fontSize: 18,
  hideAnswers: false,
  collapseKnown: true,
  onlyHighlights: false,
  filters: { ...defaultFilters },
  updatedAt: new Date().toISOString(),
});
