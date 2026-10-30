/** Server-side view of content/ (mirrors src/player/types.ts on the client). */
export interface Question {
  id: string;
  type: 'explain' | 'write_code' | 'fix_code' | 'predict_output' | 'multiple_choice' | 'fill_blank';
  prompt?: string;
  hint?: string;
  solution?: string;
  points?: number;
  answer?: string;
  options?: { id: string; text: string }[];
  expectedOutput?: string;
  blanks?: string[];
  matchMode?: 'tests' | 'exact';
}

export interface Lesson {
  id: string;
  moduleId: string;
  basePoints: number;
  questions: Question[];
}

export interface CurriculumLesson {
  id: string;
  order: number;
  title: string;
  free: boolean;
  status: string;
}

export interface CurriculumModule {
  id: string;
  order: number;
  title: string;
  requiredForCertificate?: boolean;
  lessons: CurriculumLesson[];
}

export interface Curriculum {
  modules: CurriculumModule[];
}

/** Answer sent with submitAnswer for questions the server can check itself. */
export interface SubmittedAnswer {
  optionId?: string;
  text?: string;
  blanks?: string[];
}
