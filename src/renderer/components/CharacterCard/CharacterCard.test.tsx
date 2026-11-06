import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CharacterCard } from './CharacterCard.tsx';

describe('CharacterCard', () => {
  it("shows an unlocked character's initial when it has no art", () => {
    expect(renderToStaticMarkup(<CharacterCard name="Frost" />)).toContain('>F<');
  });

  it("hides a locked character's name and initial", () => {
    const out = renderToStaticMarkup(<CharacterCard name="Frost" locked />);
    expect(out).toContain('???');
    expect(out).not.toContain('Frost');
    expect(out).not.toContain('>F<');
  });
});
