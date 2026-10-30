import { describe, expect, it } from 'vitest';
import { datasetSetup, projectToLesson, starterScript, type Project } from '../../src/lib/projects';

const project: Project = {
  id: 'demo',
  title: 'Demo',
  summary: 's',
  estimatedMinutes: 20,
  brief: 'b',
  datasets: [{ file: 'data.csv', description: 'd', content: 'a,b\n1,"x"\n' }],
  steps: [
    { id: 'q01', type: 'explain', prompt: 'Look', exampleCode: 'print(1)' },
    { id: 'q02', type: 'write_code', prompt: '**Step 1 — load.** Do it.', starterCode: 'def load():\n    pass\n', solution: 'def load():\n    return 1', tests: [], hint: 'h', setupCode: 'x = 1' },
    { id: 'q03', type: 'multiple_choice', prompt: 'Pick', options: [{ id: 'a', text: 'A' }], answer: 'a', hint: 'h' },
    { id: 'q04', type: 'fix_code', prompt: '**Step 2 — fix.** Fix it.', starterCode: 'oops', solution: 'ok', tests: [], hint: 'h' },
  ],
};

describe('projects', () => {
  it('writes every dataset file before code runs, keeping a step’s own setup', () => {
    const lesson = projectToLesson(project);
    expect(lesson.id).toBe('project-demo');
    const setup = datasetSetup(project.datasets);
    expect(setup).toContain('"data.csv": "a,b\\n1,\\"x\\"\\n"');
    expect(lesson.questions.map((q) => ('setupCode' in q ? q.setupCode : undefined))).toEqual([setup, `${setup}\nx = 1`, undefined, setup]);
  });

  it('makes a starter file with every code step as comments', () => {
    const script = starterScript(project, 'https://example.com');
    expect(script).toContain('# https://example.com/projects/demo/');
    expect(script).toContain('# Step 1 — load. Do it.');
    expect(script).toContain('def load():\n    pass');
    expect(script).toContain('# Step 2 — fix. Fix it.\n# ------');
    expect(script).not.toContain('oops'); // later steps leave room instead of repeating code
  });
});
