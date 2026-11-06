import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown.tsx';

const html = (text: string) => renderToStaticMarkup(<Markdown>{text}</Markdown>);

describe('Markdown raw images', () => {
  it('links to an image GitHub stored as a tag', () => {
    const out = html('<img width="400" alt="Login page" src="https://example.test/a.png" />');
    expect(out).toContain('href="https://example.test/a.png"');
    expect(out).toContain('Login page');
  });

  it('keeps an image inside a paragraph, and finds several in one block', () => {
    expect(html('See <img src="https://example.test/a.png"> here')).toContain('Image');
    const out = html(
      '<p align="center"><img src="https://example.test/a.png"><img src="https://example.test/b.png"></p>',
    );
    expect(out).toContain('a.png');
    expect(out).toContain('b.png');
  });

  it('removes an unsafe image URL', () => {
    expect(html('<img src="javascript:alert(1)">')).not.toContain('javascript:');
  });

  it('still leaves out other tags, and tags shown as code', () => {
    expect(html('<script>alert(1)</script>')).not.toContain('alert');
    expect(html('`<img src="https://example.test/a.png">`')).toContain('&lt;img');
  });
});
