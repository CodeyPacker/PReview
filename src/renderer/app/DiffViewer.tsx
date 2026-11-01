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
import type { DiffHunk } from '../../shared/contracts/pull-request-files.ts';
import type { ReviewThread } from '../../shared/contracts/pull-request-reviews.ts';
import type { DiffSide, ReviewDraft } from '../../shared/contracts/review-drafts.ts';
import { definePreviewTheme, monaco, monoFont } from './monaco.ts';
import styles from './DiffViewer.module.css';
import {
  DraftCard,
  DraftComposer,
  type DraftAuthor,
  type DraftComposerState,
} from './DraftComments.tsx';
import { ThreadCard } from './ReviewThreads.tsx';
import { useThemeVersion } from './useThemeVersion.ts';
import { useViewZones, type ViewZone } from './useViewZones.ts';
import {
  inOneHunk,
  originalLineInModified,
  selectedLines,
  type LineChange,
} from '../lib/diffComments.ts';
import type { FileSearchMatch } from '../lib/fileSearch.ts';
import { createFileScroller } from '../lib/fileScroller.ts';

export type DiffMode = 'split' | 'unified';

export interface DiffViewerHandle {
  startScroll: (direction: -1 | 1) => void;
  stopScroll: () => void;
  cancelScroll: () => void;
  // Opens a comment on the selected lines, or the line with the cursor.
  commentOnSelection: () => void;
}

// Line comments shown in the diff. Leave it out for a diff without comments.
export interface DiffViewerDrafts {
  // This file's drafts at the commits on show.
  items: readonly ReviewDraft[];
  // The file's diff hunks. Comments only go on lines inside them.
  hunks: readonly DiffHunk[] | null;
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
  // This file's published threads. Threads with no line in the diff are left out.
  threads?: readonly ReviewThread[];
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
  threads,
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
  // GitHub takes line comments inside a diff hunk only, and a comment on several lines
  // inside one hunk. The unified view only takes comments on the new file's lines.
  const canComment = (side: DiffSide, first: number, last = first) =>
    drafts !== undefined &&
    !(unified && side === 'original') &&
    inOneHunk(drafts.hunks, side, first, last);

  const openComposer = (next: DraftComposerState) => drafts?.onComposerChange(next);

  const commentOnLines = (side: DiffSide, first: number, last: number) => {
    if (!canComment(side, first, last)) return;
    const startLine = Math.min(first, last);
    const line = Math.max(first, last);
    openComposer({
      path,
      side,
      ...(startLine < line && { startLine }),
      line,
      body: '',
    });
  };
  const commentOnGutter = useEffectEvent(commentOnLines);
  const isCommentable = useEffectEvent(canComment);

  useImperativeHandle(ref, () => ({
    startScroll: (direction) => scroller.current?.start(direction),
    stopScroll: () => scroller.current?.stop(),
    cancelScroll: () => scroller.current?.cancel(),
    commentOnSelection: () => {
      const diffEditor = editor.current;
      if (!diffEditor) return;
      const before = diffEditor.getOriginalEditor();
      const side = !unified && before.hasTextFocus() ? 'original' : 'modified';
      const selection = (
        side === 'original' ? before : diffEditor.getModifiedEditor()
      ).getSelection();
      if (!selection) return;
      const { first, last } = selectedLines(selection);
      commentOnLines(side, first, last);
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
    // A plus in the gutter of a line that can take a comment, under the pointer. Dragging
    // from it up or down picks several lines.
    const gutters = (['original', 'modified'] as const).map((side) => {
      const sideEditor =
        side === 'original' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
      const hover = sideEditor.createDecorationsCollection();
      const picked = sideEditor.createDecorationsCollection();
      const showPicked = (first: number, last: number) =>
        picked.set([
          {
            range: new monaco.Range(Math.min(first, last), 1, Math.max(first, last), 1),
            options: {
              isWholeLine: true,
              className: styles.commentRange,
              linesDecorationsClassName: styles.commentRangeBar,
            },
          },
        ]);
      const lineAt = ({ type, position }: monaco.editor.IMouseTarget) => {
        // Comments sit in view zones, which report the line above them.
        const inZone =
          type === monaco.editor.MouseTargetType.CONTENT_VIEW_ZONE ||
          type === monaco.editor.MouseTargetType.GUTTER_VIEW_ZONE;
        return position && !inZone ? position.lineNumber : undefined;
      };
      return [
        hover,
        picked,
        sideEditor.onMouseMove((event) => {
          const line = lineAt(event.target);
          hover.set(
            line === undefined || !isCommentable(side, line)
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
          const line = lineAt(event.target);
          if (
            line === undefined ||
            event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
            !isCommentable(side, line)
          ) {
            return;
          }
          event.event.preventDefault();
          // The plus on a line inside a selection of several lines comments on all of them.
          const selection = sideEditor.getSelection();
          const selected = selection && selectedLines(selection);
          const drag =
            selected &&
            selected.first < selected.last &&
            line >= selected.first &&
            line <= selected.last &&
            isCommentable(side, selected.first, selected.last)
              ? { side, ...selected }
              : { side, first: line, last: line };
          showPicked(drag.first, drag.last);
          // The drag is followed on the window, because Monaco doesn't report every pointer move
          // while a button is held, and the pointer can leave the editor. A range stops at the
          // edge of the hunk it started in.
          const follow = (move: MouseEvent) => {
            const target = sideEditor.getTargetAtClientPoint(move.clientX, move.clientY);
            const over = target ? lineAt(target) : undefined;
            if (over !== undefined && isCommentable(side, drag.first, over)) {
              drag.last = over;
              showPicked(drag.first, over);
            }
          };
          // Holding the button would otherwise select text or start a native drag.
          const block = (other: Event) => other.preventDefault();
          const finish = () => {
            window.removeEventListener('mousemove', follow, true);
            window.removeEventListener('selectstart', block, true);
            window.removeEventListener('dragstart', block, true);
            picked.clear();
            commentOnGutter(drag.side, drag.first, drag.last);
          };
          window.addEventListener('mousemove', follow, true);
          window.addEventListener('selectstart', block, true);
          window.addEventListener('dragstart', block, true);
          window.addEventListener('mouseup', finish, { capture: true, once: true });
        }),
      ] as const;
    });
    return () => {
      for (const [hover, picked, ...subscriptions] of gutters) {
        hover.clear();
        picked.clear();
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
  const threadItems = useMemo(
    () =>
      (threads ?? []).flatMap((thread) =>
        thread.line === null ? [] : [{ ...thread, line: thread.line }],
      ),
    [threads],
  );
  const composer = drafts?.composer;
  const newComposer =
    composer && composer.draftId === undefined
      ? { side: composer.side, line: composer.line }
      : undefined;
  const newComposerSide = newComposer?.side;
  const newComposerLine = newComposer?.line;

  // Threads and comments open below their line, threads first. The unified view only shows the new file's editor, so
  // comments on the old file go below where their line would be in the new one.
  const zones = useMemo(() => {
    const place = (side: DiffSide, line: number) =>
      unified && side === 'original'
        ? { side: 'modified' as const, afterLine: originalLineInModified(lineChanges, line) }
        : { side, afterLine: line };
    const list: (ViewZone & { draftId?: number; threadId?: string })[] = [
      ...threadItems.map((thread) => ({
        key: `thread-${thread.id}`,
        threadId: thread.id,
        ...place(thread.side, thread.line),
      })),
      ...(draftItems ?? []).map((draft) => ({
        key: `draft-${draft.id}`,
        draftId: draft.id,
        ...place(draft.side, draft.line),
      })),
    ].map((zone, index) => ({ ...zone, ordinal: index }));
    if (newComposerSide && newComposerLine) {
      list.push({
        key: 'composer',
        ...place(newComposerSide, newComposerLine),
        ordinal: list.length,
      });
    }
    return list;
  }, [threadItems, draftItems, newComposerSide, newComposerLine, unified, lineChanges]);

  const editorFor = useCallback((side: DiffSide) => {
    const diffEditor = editor.current;
    if (!diffEditor) return undefined;
    return side === 'original' ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
  }, []);
  const zoneTargets = useViewZones(zones, editorFor, modelVersion, styles.zone);

  // The lines of the comment being written, or of the draft or thread under the pointer, are
  // shaded.
  const [hoveredKey, setHoveredKey] = useState<string>();
  const shaded =
    composer ??
    draftItems?.find((draft) => `draft-${draft.id}` === hoveredKey) ??
    threadItems.find((thread) => `thread-${thread.id}` === hoveredKey);
  const shadedSide = shaded?.side;
  const shadedFirst = shaded && (shaded.startLine ?? shaded.line);
  const shadedLast = shaded?.line;
  useEffect(() => {
    const diffEditor = editor.current;
    if (!diffEditor || !shadedSide || !shadedFirst || !shadedLast) return;
    const moved = unified && shadedSide === 'original';
    const place = (line: number) => (moved ? originalLineInModified(lineChanges, line) : line);
    const target =
      shadedSide === 'original' && !unified
        ? diffEditor.getOriginalEditor()
        : diffEditor.getModifiedEditor();
    const shading = target.createDecorationsCollection([
      {
        range: new monaco.Range(place(shadedFirst), 1, place(shadedLast), 1),
        options: {
          isWholeLine: true,
          className: styles.commentRange,
          linesDecorationsClassName: styles.commentRangeBar,
        },
      },
    ]);
    return () => shading.clear();
  }, [shadedSide, shadedFirst, shadedLast, unified, lineChanges, modelVersion]);

  const hoverProps = (key: string) => ({
    onMouseEnter: () => setHoveredKey(key),
    onMouseLeave: () => setHoveredKey(undefined),
  });
  const composerView = drafts && composer && (
    <DraftComposer
      composer={composer}
      onChange={(body) => drafts.onComposerChange({ ...composer, body })}
      onSave={drafts.onSave}
      onCancel={() => drafts.onComposerChange(undefined)}
      saving={drafts.saving}
      failed={drafts.saveFailed}
    />
  );
  const portals: ReactNode = zones.map((zone) => {
    const target = zoneTargets.get(zone.key);
    if (!target) return null;
    const thread = threadItems.find((item) => item.id === zone.threadId);
    const draft = drafts?.items.find((item) => item.id === zone.draftId);
    let content: ReactNode;
    if (thread) {
      content = (
        <div {...hoverProps(zone.key)}>
          <ThreadCard thread={thread} />
        </div>
      );
    } else if (!drafts || !draft || composer?.draftId === draft.id) {
      content = composerView;
    } else {
      content = (
        <div {...hoverProps(zone.key)}>
          <DraftCard
            draft={draft}
            author={drafts.author}
            deleting={drafts.deletingId === draft.id}
            onEdit={() =>
              openComposer({
                path,
                side: draft.side,
                ...(draft.startLine !== null && { startLine: draft.startLine }),
                line: draft.line,
                draftId: draft.id,
                body: draft.body,
              })
            }
            onDelete={() => drafts.onDelete(draft.id)}
          />
        </div>
      );
    }
    return createPortal(content, target, zone.key);
  });

  return (
    <div data-review-diff ref={container} className={styles.viewer}>
      {portals}
    </div>
  );
}
