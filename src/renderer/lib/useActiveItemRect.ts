import { useLayoutEffect, type RefObject } from 'react';

// Measures the container's child that matches `selector` and writes its box to custom
// properties on the container: --active-left, --active-top, --active-width and
// --active-height. A CSS indicator reads them to slide between items. Remeasures when
// `active` changes and when the container resizes. Sets data-indicator-ready after the
// first measure, so the indicator can skip the transition on its first paint.
export function useActiveItemRect(
  ref: RefObject<HTMLElement | null>,
  selector: string,
  active: unknown,
) {
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const item = container.querySelector<HTMLElement>(selector);
      container.toggleAttribute('data-has-active', item != null);
      if (!item) return;
      container.style.setProperty('--active-left', `${item.offsetLeft}px`);
      container.style.setProperty('--active-top', `${item.offsetTop}px`);
      container.style.setProperty('--active-width', `${item.offsetWidth}px`);
      container.style.setProperty('--active-height', `${item.offsetHeight}px`);
    };
    measure();
    const frame = requestAnimationFrame(() =>
      container.toggleAttribute('data-indicator-ready', true),
    );
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const item = container.querySelector<HTMLElement>(selector);
    if (item) observer.observe(item);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref, selector, active]);
}
