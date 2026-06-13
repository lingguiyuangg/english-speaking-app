export type Difficulty = 'A2' | 'B1' | 'B2';

export interface ScriptLine {
  role: string;
  content: string;
}

export interface Script {
  id: string;
  title: string;
  text: string;
  lines: ScriptLine[];
  roles: string[];
  difficulty: Difficulty;
}

export interface SavedScript {
  id: string;
  title: string;
  text: string;
  lines: ScriptLine[];
  roles: string[];
  difficulty: Difficulty;
  savedAt: number;
  lastPracticedAt: number | null;
}

export type RoundPhase =
  | 'pre-generating'
  | 'user-responding'
  | 'judging'
  | 'correct'
  | 'incorrect'
  | 'completed';

export interface HardWord {
  word: string;
  chinese: string;
  pos: string;
  fromWordBank: boolean;
}

export interface UserHint {
  zhHint: string;
  hardWords: HardWord[];
}

export interface PracticeRound {
  userLine: { en: string; zh: string };
  hint: UserHint;
  aiHardWords: HardWord[];
  expectedUserEn: string;
  aiContext?: {
    role: string;
    en: string;
    zh: string;
    aiHardWords: HardWord[];
  };
  userAnswer?: string;
  isCorrect?: boolean;
  aiFeedback?: string;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ConversationState {
  script: Script;
  userRole: string;
  aiRoles: string[];
  rounds: PracticeRound[];
  currentRoundIndex: number;
  phase: RoundPhase;
  history: ConversationMessage[];
  retryCount: number;
  generatingProgress?: { current: number; total: number };
}

export interface WordEntry {
  id: string;
  word: string;
  chinese: string;
  pos: string;
  addedAt: number;
  mastery: number;
  reviewCount: number;
  lastReviewedAt: number | null;
  source: string;
}

export interface WordBankData {
  version: number;
  words: WordEntry[];
  exportedAt: string;
}

export interface ReviewResult {
  grammarScore: number;
  wordUsageScore: number;
  naturalnessScore: number;
  overallScore: number;
  feedback: string;
  betterExample: string;
}

export interface GenerateScriptRequest {
  text: string;
  level: Difficulty;
}

export interface GenerateScriptResponse {
  title: string;
  roles: string[];
  lines: ScriptLine[];
}

export interface GenerateLineRequest {
  scriptContext: string;
  userRole: string;
  aiRoles: string[];
  conversationHistory: ConversationMessage[];
  turnIndex: number;
  scriptLine: ScriptLine;
  nextUserLineHint: string;
}

export interface GenerateLineResponse {
  en: string;
  zh: string;
  hint: UserHint;
}

export interface JudgeAnswerRequest {
  expectedHint: string;
  userAnswer: string;
  conversationHistory: ConversationMessage[];
}

export interface JudgeAnswerResponse {
  isCorrect: boolean;
  feedback: string;
}

export interface ReviewAnswerRequest {
  word: string;
  userSentence: string;
}

export interface ReviewAnswerResponse {
  grammarScore: number;
  wordUsageScore: number;
  naturalnessScore: number;
  feedback: string;
  betterExample: string;
}
