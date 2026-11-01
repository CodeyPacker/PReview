import { useEffect, useRef, useState } from 'react';
import type { DiffSide } from '../../shared/contracts/review-drafts.ts';
import type { monaco } from './monaco.ts';

export interface ViewZone {
  key: string;
  // The diff editor side the zone opens in.
  side: DiffSide;
  // The zone opens below this line. 0 puts it above the first line.
  afterLine: number;
  // Orders zones below the same line.
  ordinal: number;
}

interface Placed {
  id: string;
  zone: ViewZone;
  editor: monaco.editor.ICodeEditor;
  content: HTMLElement;
  observer: ResizeObserver;
}

// Monaco handles pointer and key events that reach the editor, which would steal clicks and
// keys from the fields inside a zone.
const CONTAINED_EVENTS = ['mousedown', 'pointerdown', 'keydown', 'contextmenu'] as const;

function removeZone(entry: Placed) {
  entry.observer.disconnect();
  // A disposed editor has no model and has already dropped its zones.
  if (entry.editor.getModel()) {
    entry.editor.changeViewZones((accessor) => accessor.removeZone(entry.id));
  }
}

// Zones fill the visible code area. Monaco scrolls zones sideways with the code, so they are
// moved back by the same amount to stay in view.
function fitWidth(entry: Placed) {
  const layout = entry.editor.getLayoutInfo();
  entry.content.style.width = `${Math.max(0, layout.contentWidth - layout.verticalScrollbarWidth)}px`;
  entry.content.style.transform = `translateX(${entry.editor.getScrollLeft()}px)`;
}

// Opens space between editor lines for each zone and returns an element per zone key to
// render into. modelVersion must change whenever an editor's model does, because Monaco drops
// every zone with the old model.
export function useViewZones(
  zones: readonly ViewZone[],
  editorFor: (side: DiffSide) => monaco.editor.ICodeEditor | undefined,
  modelVersion: number,
  className: string | undefined,
): ReadonlyMap<string, HTMLElement> {
  const placed = useRef(new Map<string, Placed>());
  const placedVersion = useRef(modelVersion);
  const [targets, setTargets] = useState<ReadonlyMap<string, HTMLElement>>(new Map());

  useEffect(() => {
    const current = placed.current;
    const wanted = new Map(zones.map((zone) => [zone.key, zone]));
    for (const [key, entry] of current) {
      const zone = wanted.get(key);
      if (
        placedVersion.current !== modelVersion ||
        !zone ||
        zone.side !== entry.zone.side ||
        zone.afterLine !== entry.zone.afterLine ||
        zone.ordinal !== entry.zone.ordinal
      ) {
        removeZone(entry);
        current.delete(key);
      }
    }
    placedVersion.current = modelVersion;

    for (const zone of zones) {
      const editor = editorFor(zone.side);
      if (current.has(zone.key) || !editor) continue;
      const node = document.createElement('div');
      // Monaco's text layer is drawn over its zones and would take every click.
      node.style.zIndex = '1';
      for (const type of CONTAINED_EVENTS) {
        node.addEventListener(type, (event) => event.stopPropagation());
      }
      const content = document.createElement('div');
      content.className = className ?? '';
      node.append(content);
      const viewZone: monaco.editor.IViewZone = {
        afterLineNumber: zone.afterLine,
        ordinal: zone.ordinal,
        // Monaco hides a zone with no height, and a hidden zone's content can't be measured.
        heightInPx: 1,
        domNode: node,
      };
      let id = '';
      editor.changeViewZones((accessor) => {
        id = accessor.addZone(viewZone);
      });
      // Monaco hides its zone layer from assistive technology, which would hide the comment
      // fields too. The DiffViewer e2e test fails if this stops working after an upgrade.
      node.parentElement?.removeAttribute('aria-hidden');
      const observer = new ResizeObserver(() => {
        if (viewZone.heightInPx === content.offsetHeight) return;
        viewZone.heightInPx = content.offsetHeight;
        editor.changeViewZones((accessor) => accessor.layoutZone(id));
      });
      observer.observe(content);
      const entry = { id, zone, editor, content, observer };
      fitWidth(entry);
      current.set(zone.key, entry);
    }

    setTargets((previous) =>
      previous.size === current.size &&
      [...current].every(([key, entry]) => previous.get(key) === entry.content)
        ? previous
        : new Map([...current].map(([key, entry]) => [key, entry.content])),
    );

    const editors = new Set([...current.values()].map((entry) => entry.editor));
    const subscriptions = [...editors].flatMap((editor) => {
      const fit = () => {
        for (const entry of current.values()) {
          if (entry.editor === editor) fitWidth(entry);
        }
      };
      return [
        editor.onDidLayoutChange(fit),
        editor.onDidScrollChange((event) => {
          if (event.scrollLeftChanged) fit();
        }),
      ];
    });
    return () => subscriptions.forEach((subscription) => subscription.dispose());
  }, [zones, editorFor, modelVersion, className]);

  useEffect(
    () => () => {
      const current = placed.current;
      current.forEach(removeZone);
      current.clear();
    },
    [],
  );

  return targets;
}
