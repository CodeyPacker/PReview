import type { PreviewApi } from '../shared/contracts/preload.ts';

declare global {
  interface Window {
    preview: PreviewApi;
  }
}
