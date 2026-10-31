// Runs Monaco from the app's own files, so it needs no network.
import * as monaco from 'monaco-editor/editor/editor.api';
// Syntax highlighting for every language. The language servers are left out, so there is no
// completion or type checking, which a read-only diff doesn't need.
import 'monaco-editor/basic-languages/monaco.contribution';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

// The value of a design token as it is on <html> now.
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Monaco wants token colors without the leading #.
function bare(name: string): string {
  return token(name).replace('#', '');
}

function isDark(): boolean {
  const { theme } = document.documentElement.dataset;
  return (
    theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

// Builds a Monaco theme from the design tokens. Call it again after the app theme changes,
// with a new name, so Monaco picks up the new colors.
export function definePreviewTheme(name: string): void {
  monaco.editor.defineTheme(name, {
    base: isDark() ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: bare('--syntax-keyword') },
      { token: 'string', foreground: bare('--syntax-string') },
      { token: 'type', foreground: bare('--syntax-type') },
      { token: 'type.identifier', foreground: bare('--syntax-type') },
      { token: 'number', foreground: bare('--syntax-number') },
      { token: 'comment', foreground: bare('--syntax-comment') },
    ],
    colors: {
      'editor.background': token('--surface-solid'),
      'editor.foreground': token('--ink'),
      'editorGutter.background': token('--surface-solid'),
      'editorLineNumber.foreground': token('--syntax-comment'),
      'editorLineNumber.activeForeground': token('--ink'),
      'editor.lineHighlightBackground': '#00000000',
      'diffEditor.insertedLineBackground': token('--diff-add-bg'),
      'diffEditor.insertedTextBackground': token('--diff-add-strong'),
      'diffEditor.removedLineBackground': token('--diff-del-bg'),
      'diffEditor.removedTextBackground': token('--diff-del-strong'),
      'editorGutter.addedBackground': token('--diff-add-strong'),
      'editorGutter.deletedBackground': token('--diff-del-strong'),
    },
  });
}

export { monaco };

export function monoFont(): string {
  return token('--font-mono');
}
