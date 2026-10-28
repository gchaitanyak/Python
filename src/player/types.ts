/** Lesson format — mirrors content/lesson.schema.json. */
export interface Test {
  name: string;
  code: string;
  message: string;
}

interface QuestionBase {
  id: string;
  prompt: string;
  points?: number;
  hint?: string;
  explanation?: string;
}

export interface ExplainQuestion extends QuestionBase {
  type: 'explain';
  exampleCode?: string;
}

export interface CodeQuestion extends QuestionBase {
  type: 'write_code' | 'fix_code';
  starterCode: string;
  solution: string;
  setupCode?: string;
  tests: Test[];
  hint: string;
}

export interface PredictQuestion extends QuestionBase {
  type: 'predict_output';
  code: string;
  expectedOutput: string;
  hint: string;
}

export interface ChoiceQuestion extends QuestionBase {
  type: 'multiple_choice';
  options: { id: string; text: string }[];
  answer: string;
  hint: string;
}

export interface FillBlankQuestion extends QuestionBase {
  type: 'fill_blank';
  template: string;
  blanks: string[];
  matchMode?: 'tests' | 'exact';
  tests?: Test[];
  hint: string;
}

export type Question = ExplainQuestion | CodeQuestion | PredictQuestion | ChoiceQuestion | FillBlankQuestion;

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  estimatedMinutes: number;
  basePoints: number;
  intro: string;
  questions: Question[];
}

export interface CurriculumLesson {
  id: string;
  order: number;
  title: string;
  free: boolean;
  daily?: boolean;
  type?: 'lesson' | 'summary';
  status: 'written' | 'to-write' | string;
  objectives?: string[];
}

export interface CurriculumModule {
  id: string;
  order: number;
  title: string;
  summary?: string;
  optional?: boolean;
  lessons: CurriculumLesson[];
}

export interface Curriculum {
  modules: CurriculumModule[];
}

export const isGradable = (q: Question): boolean => q.type !== 'explain';
