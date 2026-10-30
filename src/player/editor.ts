import { indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';

export interface EditorOptions {
  doc: string;
  label: string;
  onRun?: () => void;
  onCheck?: () => void;
  onChange?: (code: string) => void;
}

export interface CodeEditor {
  view: EditorView;
  get code(): string;
  set code(value: string);
  focus(): void;
  destroy(): void;
}

const theme = EditorView.theme({
  '&': { fontSize: '0.95rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)' },
  '&.cm-focused': { outline: 'var(--focus-ring)', outlineOffset: '2px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', minHeight: '12rem', maxHeight: '28rem' },
  '.cm-gutters': { background: 'var(--color-surface)', color: 'var(--color-text-muted)', borderRight: '1px solid var(--color-border)' },
});

/**
 * CodeMirror 6 with Python. Shift+Enter runs, Ctrl/Cmd+Enter checks.
 * Tab indents; Esc then Tab moves focus out (CodeMirror's tab-focus escape).
 */
export function createEditor(parent: HTMLElement, options: EditorOptions): CodeEditor {
  const shortcuts = Prec.highest(
    keymap.of([
      { key: 'Shift-Enter', run: () => (options.onRun ? (options.onRun(), true) : false) },
      { key: 'Mod-Enter', run: () => (options.onCheck ? (options.onCheck(), true) : false) },
    ]),
  );
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        shortcuts,
        basicSetup,
        keymap.of([indentWithTab]),
        python(),
        EditorState.tabSize.of(4),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': options.label }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) options.onChange?.(u.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    view,
    get code() {
      return view.state.doc.toString();
    },
    set code(value: string) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
