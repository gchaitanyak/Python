import type { Test } from '../player/types';

export interface PyError {
  type: string;
  message: string;
  line: number | null;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

export type ToWorker =
  | { type: 'init' }
  | { type: 'run'; id: number; code: string; setupCode?: string; stdin?: string }
  | { type: 'grade'; id: number; code: string; tests: Test[]; setupCode?: string };

export interface RunResult {
  stdout: string;
  stderr: string;
  error: PyError | null;
}

export interface GradeResult extends RunResult {
  passed: boolean;
  results: TestResult[];
}

export type FromWorker =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | ({ type: 'result'; id: number } & RunResult)
  | ({ type: 'graded'; id: number } & GradeResult);
