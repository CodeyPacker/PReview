import {
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import type { DiffSide, ReviewDraft } from '../../shared/contracts/review-drafts.ts';
import { definePreviewTheme, monaco, monoFont } from './monaco.ts';
import styles from './DiffViewer.module.css';
import {
  DraftCard,
  DraftComposer,
  type DraftAuthor,
  type DraftComposerState,
} from './DraftComments.tsx';
import { useThemeVersion } from './useThemeVersion.ts';
import { useViewZones, type ViewZone } from './useViewZones.ts';
import { originalLineInModified, type LineChange } from '../lib/diffComments.ts';
import type { FileSearchMatch } from '../lib/fileSearch.ts';
import { createFileScroller } from '../lib/fileScroller.ts';

export type DiffMode = 'split' | 'unified';

export interface DiffViewerHandle {
  startScroll: (direction: -1 | 1) => void;
  stopScroll: () => void;
  cancelScroll: () => void;
  // Opens a comment on the line with the cursor. Does nothing on a line GitHub can't take
  // a comment on.
  commentOnCursorLine: () => void;
}

// Line comments shown in the diff. Leave it out for a diff without comments.
export interface DiffViewerDrafts {
  // This file's drafts at the commits on show.
  items: readonly ReviewDraft[];
  author: DraftAuthor;
  // The comment being written, when it is on this file.
  composer: DraftComposerState | undefined;
  onComposerChange: (composer: DraftComposerState | undefined) => void;
  onSave: () => void;
  saving: boolean;
  saveFailed: boolean;
  onDelete: (id: number) => void;
  deletingId: number | undefined;
}

export interface DiffViewerProps {
  ref?: Ref<DiffViewerHandle>;
  path: string;
  // The path before a rename. Gives the old side its own language and name.
  previousPath: string | null;
  original: string;
  modified: string;
  mode: DiffMode;
  onLineNumberOffsetChange?: (offset: number) => void;
  searchQuery?: string;
  searchMatch?: FileSearchMatch;
  drafts?: DiffViewerDrafts;
}

interface Models {
  original: monaco.editor.ITextModel;
  modified: monaco.editor.ITextModel;
}

// Monaco's own originalAriaLabel and modifiedAriaLabel options leave the input unnamed until it
// detects a screen reader, which axe fails. The selectors are Monaco's, so recheck them when
// upgrading it. The DiffViewer story fails if they stop matching.
function nameInputs(container: HTMLElement | null): void {
  container
    ?.querySelector('.original-in-monaco-diff-editor .native-edit-context')
    ?.setAttribute('aria-label', 'Before the change');
  container
    ?.querySelector('.modified-in-monaco-diff-editor .native-edit-context')
    ?.setAttribute('aria-label', 'After the change');
}

// Gives every model its own URI, so a file can be shown again before the old model is gone.
let modelCount = 0;

function createModel(scheme: string, path: string, text: string): monaco.editor.ITextModel {
  // Monaco picks the language from the file extension in the URI.
  const uri = monaco.Uri.from({ scheme, path: `/${path}`, query: String(modelCount++) });
  return monaco.editor.createModel(text, undefined, uri);
}

// A read-only Monaco diff of one file.
export function DiffViewer({
  ref,
  path,
  previousPath,
  original,
  modified,
  mode,
  onLineNumberOffsetChange,
  searchQuery = '',
  searchMatch,
  drafts,
}: DiffViewerProps) {
  const themeVersion = useThemeVersion();
  const theme = `preview-${themeVersion}`;

  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneDiffEditor>(null);
  const models = useRef<Models>(null);
  const scroller = useRef<ReturnType<typeof createFileScroller> | null>(null);
  const [modelVersion, setModelVersion] = useState(0);
  const [lineChanges, setLineChanges] = useState<readonly LineChange[]>([]);

  const unified = mode === 'unified';
  // Any line can take a comment. The unified view only shows the new file's lines.
  const canComment = (side: DiffSide) => drafts !== undefined && !(unified && side === 'original');

  const openComposer = (next: DraftComposerState) => drafts?.onComposerChange(next);

  const commentOnLine = (side: DiffSide, line: number) => {
    if (canComment(side)) openComposer({ path, side, line, body: '' });
  };
  const commentOnGutter = useEffectEvent(commentOnLine);
  const isCommentable = useEffectEvent(canComment);

  useImperativeHandle(ref, () => ({
    startScroll: (direction) => scroller.current?.start(direction),
    stopScroll: () => scroller.current?.stop(),
    cancelScroll: () => scroller.current?.cancel(),
    commentOnCursorLine: () => {
      const diffEditor = editor.current;
      if (!diffEditor) return;
      const before = diffEditor.getOriginalEditor();
      const side = !unified && before.hasTextFocus() ? 'original' : 'modified';
      const line = (side === 'original' ? before : diffEditor.getModifiedEditor()).getPosition()
        ?.lineNumber;
      if (line) commentOnLine(side, line);
    },
  }));

  useEffect(() => {
    if (!container.current) return;
    const diffEditor = monaco.editor.createDiffEditor(container.current, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      smoothScrolling: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      useInlineViewWhenSpaceIsLimited: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      fontFamily: monoFont(),
      fontSize: 13,
    });
    editor.current = diffEditor;
    const code = diffEditor.getModifiedEditor();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const fileScroller = createFileScroller({
      read: () => Math.max(0, code.getScrollTop()),
      write: (top) => code.setScrollTop(top, monaco.editor.ScrollType.Immediate),
      max: () => Math.max(0, code.getScrollHeight() - code.getLayoutInfo().height),
      step: () => code.getOption(monaco.editor.EditorOption.lineHeight) * 3,
      reducedMotion: () => motion.matches,
    });
    scroller.current = fileScroller;
    const updateMotion = () => {
      fileScroller.cancel();
      diffEditor.updateOptions({ smoothScrolling: !motion.matches });
    };
    const stopForPointer = () => fileScroller.cancel();
    const element = container.current;
    element.addEventListener('wheel', stopForPointer, { passive: true, capture: true });
    element.addEventListener('pointerdown', stopForPointer, true);
    motion.addEventListener('change', updateMotion);
    // Monaco builds and rebuilds its inputs as the layout and models change.
    const inputObserver = new MutationObserver(() => nameInputs(element));
    inputObserver.observe(element, { childList: true, subtree: true });
    nameInputs(element);
    // Monaco drops view zones with a model and works the diff out after it.
    const modelChange = diffEditor.onDidChangeModel(() =>
      setModelVersion((version) => version + 1),
    );
    const diffUpdate = diffEditor.onDidUpdateDiff(() =>
      setLineChanges(diffEditor.getLineChanges() ?? []),
    );
    // A plus in the gutter of a line that can take a comment, under the pointer.
    const gutters = (['original', 'modified'] as const).map((side) => {
      const sideEditor =
        side === 'original' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
      const hover = sideEditor.createDecorationsCollection();
      const lineAt = (event: monaco.editor.IEditorMouseEvent) => {
        const line = event.target.position?.lineNumber;
        return line !== undefined && isCommentable(side) ? line : undefined;
      };
      return [
        hover,
        sideEditor.onMouseMove((event) => {
          const line = lineAt(event);
          hover.set(
            line === undefined
              ? []
              : [
                  {
                    range: new monaco.Range(line, 1, line, 1),
                    options: { glyphMarginClassName: styles.commentGlyph },
                  },
                ],
          );
        }),
        sideEditor.onMouseLeave(() => hover.clear()),
        sideEditor.onMouseDown((event) => {
          const line = lineAt(event);
          if (
            line !== undefined &&
            event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
          ) {
            commentOnGutter(side, line);
          }
        }),
      ] as const;
    });
    return () => {
      for (const [hover, ...subscriptions] of gutters) {
        hover.clear();
        subscriptions.forEach((subscription) => subscription.dispose());
      }
      modelChange.dispose();
      diffUpdate.dispose();
      inputObserver.disconnect();
      fileScroller.cancel();
      scroller.current = null;
      element.removeEventListener('wheel', stopForPointer, true);
      element.removeEventListener('pointerdown', stopForPointer, true);
      motion.removeEventListener('change', updateMotion);
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
    scroller.current?.cancel();
    const next = {
      original: createModel('original', previousPath ?? path, original),
      modified: createModel('modified', path, modified),
    };
    editor.current.setModel(next);
    const previous = models.current;
    models.current = next;
    previous?.original.dispose();
    previous?.modified.dispose();
  }, [path, previousPath, original, modified]);

  useEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor) return;
    diffEditor.updateOptions({
      renderSideBySide: mode === 'split',
      compactMode: mode === 'unified' && original.length === 0,
    });
    // Keep old numbers on deleted lines, but avoid repeating unchanged lines' numbers.
    const updateLineNumbers = () => {
      const changes = diffEditor.getLineChanges() ?? [];
      diffEditor.getOriginalEditor().updateOptions({
        lineNumbers:
          mode === 'split'
            ? 'on'
            : (line) =>
                changes.some(
                  (change) =>
                    change.originalEndLineNumber !== 0 &&
                    line >= change.originalStartLineNumber &&
                    line <= change.originalEndLineNumber,
                )
                  ? String(line)
                  : '',
      });
    };
    updateLineNumbers();
    const subscription = diffEditor.onDidUpdateDiff(updateLineNumbers);
    return () => subscription.dispose();
  }, [mode, original]);

  useEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor || !onLineNumberOffsetChange) return;
    const numberEditor =
      mode === 'unified' && original.length === 0
        ? diffEditor.getModifiedEditor()
        : diffEditor.getOriginalEditor();
    const alignHeader = () => {
      const layout = numberEditor.getLayoutInfo();
      const font = numberEditor.getOption(
        monaco.editor.EditorOption.fontInfo,
      ) as monaco.editor.FontInfo;
      onLineNumberOffsetChange(
        layout.lineNumbersLeft + layout.lineNumbersWidth - font.typicalHalfwidthCharacterWidth,
      );
    };
    alignHeader();
    const subscription = numberEditor.onDidLayoutChange(alignHeader);
    return () => subscription.dispose();
  }, [mode, original, onLineNumberOffsetChange]);

  useEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor) return;
    const before = diffEditor.getOriginalEditor();
    const after = diffEditor.getModifiedEditor();
    const originalHits = before.createDecorationsCollection();
    const modifiedHits = after.createDecorationsCollection();
    if (searchQuery) {
      const find = (code: monaco.editor.IStandaloneCodeEditor) =>
        code.getModel()?.findMatches(searchQuery, false, false, false, null, false, 500) ?? [];
      const beforeMatches = find(before);
      const afterMatches = find(after);
      const decorate = (matches: monaco.editor.FindMatch[]) =>
        matches.map(({ range }) => ({ range, options: { inlineClassName: styles.searchHit } }));
      originalHits.set(decorate(beforeMatches));
      modifiedHits.set(decorate(afterMatches));
      const match =
        searchMatch ??
        (afterMatches[0]
          ? { side: 'modified' as const, line: afterMatches[0].range.startLineNumber }
          : beforeMatches[0]
            ? { side: 'original' as const, line: beforeMatches[0].range.startLineNumber }
            : undefined);
      if (match) {
        scroller.current?.cancel();
        (match.side === 'original' ? before : after).revealLineInCenter(
          match.line,
          matchMedia('(prefers-reduced-motion: reduce)').matches
            ? monaco.editor.ScrollType.Immediate
            : monaco.editor.ScrollType.Smooth,
        );
      }
    }
    return () => {
      originalHits.clear();
      modifiedHits.clear();
    };
  }, [searchQuery, searchMatch, path, original, modified, mode]);

  useEffect(() => {
    // Monaco themes can't be changed in place, so each theme change defines a new one.
    definePreviewTheme(theme);
    monaco.editor.setTheme(theme);
  }, [theme]);

  const commentsOn = drafts !== undefined;
  useEffect(() => {
    editor.current?.updateOptions({ glyphMargin: commentsOn });
  }, [commentsOn]);

  const draftItems = drafts?.items;
  const composer = drafts?.composer;
  const newComposer =
    composer && composer.draftId === undefined
      ? { side: composer.side, line: composer.line }
      : undefined;
  const newComposerSide = newComposer?.side;
  const newComposerLine = newComposer?.line;

  // Comments open below their line. The unified view only shows the new file's editor, so
  // comments on the old file go below where their line would be in the new one.
  const zones = useMemo(() => {
    const place = (side: DiffSide, line: number) =>
      unified && side === 'original'
        ? { side: 'modified' as const, afterLine: originalLineInModified(lineChanges, line) }
        : { side, afterLine: line };
    const list: (ViewZone & { draftId?: number })[] = (draftItems ?? []).map((draft, index) => ({
      key: `draft-${draft.id}`,
      draftId: draft.id,
      ...place(draft.side, draft.line),
      ordinal: index,
    }));
    if (newComposerSide && newComposerLine) {
      list.push({
        key: 'composer',
        ...place(newComposerSide, newComposerLine),
        ordinal: list.length,
      });
    }
    return list;
  }, [draftItems, newComposerSide, newComposerLine, unified, lineChanges]);

  const editorFor = useCallback((side: DiffSide) => {
    const diffEditor = editor.current;
    if (!diffEditor) return undefined;
    return side === 'original' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
  }, []);
  const zoneTargets = useViewZones(zones, editorFor, modelVersion, styles.zone);

  let portals: ReactNode = null;
  if (drafts) {
    const composerView = composer && (
      <DraftComposer
        composer={composer}
        onChange={(body) => drafts.onComposerChange({ ...composer, body })}
        onSave={drafts.onSave}
        onCancel={() => drafts.onComposerChange(undefined)}
        saving={drafts.saving}
        failed={drafts.saveFailed}
      />
    );
    portals = zones.map((zone) => {
      const target = zoneTargets.get(zone.key);
      if (!target) return null;
      const draft = drafts.items.find((item) => item.id === zone.draftId);
      const content = !draft ? (
        composerView
      ) : composer?.draftId === draft.id ? (
        composerView
      ) : (
        <DraftCard
          draft={draft}
          author={drafts.author}
          deleting={drafts.deletingId === draft.id}
          onEdit={() =>
            openComposer({
              path,
              side: draft.side,
              line: draft.line,
              draftId: draft.id,
              body: draft.body,
            })
          }
          onDelete={() => drafts.onDelete(draft.id)}
        />
      );
      return createPortal(content, target, zone.key);
    });
  }

  return (
    <div data-review-diff ref={container} className={styles.viewer}>
      {portals}
    </div>
  );
}
