/** How the player saves to a signed-in account. Implemented over Cloud Functions in practice/main.ts. */
export interface SubmitPayload {
  lessonId: string;
  questionId: string;
  correct: boolean;
  viewedSolution: boolean;
  answer?: { optionId?: string; text?: string; blanks?: string[] };
}

export interface SubmitResult {
  correct: boolean;
  points: number;
  alreadyAwarded: boolean;
  tries: number;
  totalPoints: number;
}

export interface CompleteResult {
  streak: number;
  bestAccuracy: number;
  nextLessonId: string | null;
}

export interface HintResult {
  hint: string;
  hintId: string;
  remaining: number;
}

export interface AccountSync {
  submitAnswer(payload: SubmitPayload): Promise<SubmitResult>;
  completeLesson(lessonId: string, accuracy: number): Promise<CompleteResult>;
  /** +100 once per user for sharing a finished lesson (SPEC §5.2). */
  claimShareBonus(): Promise<{ awarded: number; totalPoints: number }>;
  /** AI tutor hint (SPEC §5.6) and its 👍/👎. */
  getHint(payload: { lessonId: string; questionId: string; code: string; failMessage: string }): Promise<HintResult>;
  rateHint(hintId: string, helpful: boolean): Promise<void>;
  /** "Was this lesson clear?" (SPEC §5.10). */
  sendFeedback(lessonId: string, rating: 'up' | 'down', text: string): Promise<void>;
}
