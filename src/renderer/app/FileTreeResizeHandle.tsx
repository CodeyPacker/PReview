import { useEffect, useEffectEvent, useRef, useState } from 'react';
import styles from './FileTreeResizeHandle.module.css';

const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 300;

export function FileTreeResizeHandle({
  width,
  onResize,
  onDraggingChange,
}: {
  width: number;
  onResize: (width: number) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [maxWidth, setMaxWidth] = useState(600);
  const measure = useEffectEvent((available: number) => {
    const maximum = Math.max(MIN_WIDTH, Math.min(600, Math.floor(available * 0.4)));
    setMaxWidth(maximum);
    if (width > maximum) onResize(maximum);
  });
  useEffect(() => {
    const workspace = handle.current?.parentElement?.parentElement;
    if (!workspace) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);
  const resize = (next: number) =>
    onResize(Math.round(Math.max(MIN_WIDTH, Math.min(maxWidth, next))));
  return (
    <div
      ref={handle}
      className={styles.handle}
      role="separator"
      aria-label="Resize file tree"
      aria-orientation="vertical"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      aria-controls="review-files"
      tabIndex={0}
      title="Drag to resize file tree. Use arrow keys, or double-click to reset."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
        onDraggingChange(true);
      }}
      onPointerMove={(event) => {
        if (drag.current) resize(drag.current.width + event.clientX - drag.current.x);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        onDraggingChange(false);
      }}
      onDoubleClick={() => resize(DEFAULT_WIDTH)}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Home') resize(MIN_WIDTH);
        if (event.key === 'End') resize(maxWidth);
        if (event.key === 'ArrowLeft') resize(width - 20);
        if (event.key === 'ArrowRight') resize(width + 20);
      }}
    />
  );
}
