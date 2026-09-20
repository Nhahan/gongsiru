/* Generated from schema/content.schema.json. Do not edit. */

export interface Content {
  schemaVersion: 1;
  papers: Paper[];
  topics: Topic[];
  questions: Question[];
  explanations: Explanation[];
}
/**
 * This interface was referenced by `Content`'s JSON-Schema
 * via the `definition` "Paper".
 */
export interface Paper {
  id: string;
  subjectId: string;
  title: string;
  year: number;
  heldOn?: string;
  examType: "national" | "local";
  grade: 7 | 9;
  round: string;
  booklet: string;
  sourceUrl: string;
  answerSourceUrl: string;
  answerStatus: "provisional" | "final";
  questionCount: number;
  sha256?: string;
  sourcePath?: string;
}
/**
 * This interface was referenced by `Content`'s JSON-Schema
 * via the `definition` "Topic".
 */
export interface Topic {
  id: string;
  subjectId: string;
  title: string;
  order: number;
  parentId?: string;
}
/**
 * This interface was referenced by `Content`'s JSON-Schema
 * via the `definition` "Question".
 */
export interface Question {
  id: string;
  paperId: string;
  number: number;
  revision: number;
  assessmentRevision?: number;
  topicId: string;
  stem: string;
  context: string;
  /**
   * @minItems 2
   */
  choices: [Choice, Choice, ...Choice[]];
  answer: {
    choices: string[];
    status: "final" | "provisional" | "cancelled";
  };
  sourcePage: number;
  sourceVerified: boolean;
  sourceAsset?: string;
  contentHash?: string;
}
/**
 * This interface was referenced by `Content`'s JSON-Schema
 * via the `definition` "Choice".
 */
export interface Choice {
  id: string;
  text: string;
}
/**
 * This interface was referenced by `Content`'s JSON-Schema
 * via the `definition` "Explanation".
 */
export interface Explanation {
  questionId: string;
  revision?: number;
  status: "draft" | "needs-review" | "verified";
  legalStatus: "unreviewed" | "unchanged" | "changed";
  checkedAt: string;
  summary: string;
  currentNote?: string;
  options: {
    choiceId: string;
    verdict: "true" | "false" | "conditional" | "unknown";
    text: string;
    referenceIds: string[];
  }[];
  references: Reference[];
}
/**
 * This interface was referenced by `Content`'s JSON-Schema
 * via the `definition` "Reference".
 */
export interface Reference {
  id: string;
  label: string;
  url: string;
  kind: "statute" | "case" | "official";
  article?: string;
  caseNumber?: string;
  effectiveDate?: string;
  checkedAt: string;
}
