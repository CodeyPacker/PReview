import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Typography } from './Typography.tsx';

describe('Typography', () => {
  it('keeps the rendered heading when another heading supplies its styling', () => {
    const html = renderToStaticMarkup(
      <Typography tag="h1" as="h6" id="inbox" aria-label="Inbox details">
        Inbox
      </Typography>,
    );

    expect(html).toMatch(/^<h1\b/);
    expect(html).toContain('data-size="sm"');
    expect(html).toContain('data-weight="medium"');
    expect(html).not.toContain('data-font="display"');
    expect(html).toContain('id="inbox"');
    expect(html).toContain('aria-label="Inbox details"');
    expect(html).not.toContain(' as=');
    expect(html).not.toContain(' tag=');
  });

  it('uses the rendered tag for styling when as is omitted', () => {
    const html = renderToStaticMarkup(<Typography tag="h3">Inbox</Typography>);

    expect(html).toMatch(/^<h3\b/);
    expect(html).toContain('data-size="lg"');
    expect(html).toContain('data-weight="semibold"');
  });

  it('lets explicit styles override the selected style without affecting label attributes', () => {
    const html = renderToStaticMarkup(
      <Typography tag="label" as="h6" size="lg" weight="regular" color="secondary" htmlFor="repo">
        Repository
      </Typography>,
    );

    expect(html).toMatch(/^<label\b/);
    expect(html).toContain('for="repo"');
    expect(html).toContain('data-size="lg"');
    expect(html).toContain('data-weight="regular"');
    expect(html).toContain('data-color="secondary"');
  });

  it('defaults to a paragraph even when as requests heading styling', () => {
    const html = renderToStaticMarkup(<Typography as="h6">Inbox</Typography>);

    expect(html).toMatch(/^<p\b/);
    expect(html).toContain('data-size="sm"');
  });
});
