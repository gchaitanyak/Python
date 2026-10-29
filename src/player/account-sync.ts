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

export interface AccountSync {
  submitAnswer(payload: SubmitPayload): Promise<SubmitResult>;
  completeLesson(lessonId: string, accuracy: number): Promise<CompleteResult>;
}
