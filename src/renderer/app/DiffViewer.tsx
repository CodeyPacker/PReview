import { useEffect, useRef } from 'react';
import { definePreviewTheme, monaco, monoFont } from './monaco.ts';
import styles from './DiffViewer.module.css';
import { useThemeVersion } from './useThemeVersion.ts';

export type DiffMode = 'split' | 'unified';

export interface DiffViewerProps {
  path: string;
  // The path before a rename. Gives the old side its own language and name.
  previousPath: string | null;
  original: string;
  modified: string;
  mode: DiffMode;
}

interface Models {
  original: monaco.editor.ITextModel;
  modified: monaco.editor.ITextModel;
}

// Gives every model its own URI, so a file can be shown again before the old model is gone.
let modelCount = 0;

function createModel(scheme: string, path: string, text: string): monaco.editor.ITextModel {
  // Monaco picks the language from the file extension in the URI.
  const uri = monaco.Uri.from({ scheme, path: `/${path}`, query: String(modelCount++) });
  return monaco.editor.createModel(text, undefined, uri);
}

// A read-only Monaco diff of one file.
export function DiffViewer({ path, previousPath, original, modified, mode }: DiffViewerProps) {
  const themeVersion = useThemeVersion();
  const theme = `preview-${themeVersion}`;

  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor>(null);
  const models = useRef<Models>(null);

  useEffect(() => {
    if (!container.current) return;
    const diffEditor = monaco.editor.createDiffEditor(container.current, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      fontFamily: monoFont(),
      fontSize: 13,
    });
    editor.current = diffEditor;
    return () => {
      // The editor has to let go of the models before they are disposed.
      diffEditor.setModel(null);
      diffEditor.dispose();
      models.current?.original.dispose();
      models.current?.modified.dispose();
      editor.current = null;
      models.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editor.current) return;
    const next = {
      original: createModel('original', previousPath ?? path, original),
      modified: createModel('modified', path, modified),
    };
    editor.current.setModel(next);
    // Monaco's own originalAriaLabel and modifiedAriaLabel options leave the input unnamed until it
    // detects a screen reader, which axe fails. The selectors are Monaco's, so recheck them when
    // upgrading it. The DiffViewer story fails if they stop matching.
    container.current
      ?.querySelector('.original-in-monaco-diff-editor .native-edit-context')
      ?.setAttribute('aria-label', 'Before the change');
    container.current
      ?.querySelector('.modified-in-monaco-diff-editor .native-edit-context')
      ?.setAttribute('aria-label', 'After the change');
    const previous = models.current;
    models.current = next;
    previous?.original.dispose();
    previous?.modified.dispose();
  }, [path, previousPath, original, modified]);

  useEffect(() => {
    editor.current?.updateOptions({ renderSideBySide: mode === 'split' });
  }, [mode]);

  useEffect(() => {
    // Monaco themes can't be changed in place, so each theme change defines a new one.
    definePreviewTheme(theme);
    monaco.editor.setTheme(theme);
  }, [theme]);

  return <div ref={container} className={styles.viewer} />;
}
