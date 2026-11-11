import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PullRequestFile } from '../../shared/contracts/pull-request-files.ts';
import { ChangedFiles, type ChangedFilesProps } from './ChangedFiles.tsx';

const file = (path: string): PullRequestFile =>
  ({
    path,
    blobSha: `sha-${path}`,
    previousPath: null,
    status: 'modified',
    additions: 1,
    deletions: 1,
  }) as PullRequestFile;

const files = ['src/a.test.ts', 'src/a.ts', 'src/Button.stories.tsx', 'pnpm-lock.yaml'].map(file);

function render(props: Partial<ChangedFilesProps>) {
  return renderToStaticMarkup(
    <ChangedFiles
      files={files}
      totalFiles={files.length}
      reviewStates={{}}
      filter="all"
      onFilterChange={vi.fn()}
      searchQuery=""
      onSearchChange={vi.fn()}
      searchMatches={new Map()}
      searching={false}
      searchFailed={0}
      searchSkipped={0}
      loading={false}
      error={false}
      selectedPath={undefined}
      onSelect={vi.fn()}
      {...props}
    />,
  );
}

describe('ChangedFiles support file group', () => {
  it('collapses tests, stories and generated files into one group', () => {
    const html = render({ groupSupport: true, supportOpen: false });
    expect(html).toContain('Tests, stories &amp; generated');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('src/a.ts');
    expect(html).not.toContain('src/a.test.ts');
    expect(html).not.toContain('pnpm-lock.yaml');
    // The total still counts every changed file.
    expect(html).toContain('4 files changed');
  });

  it('lists the group after the code once opened', () => {
    const html = render({ groupSupport: true, supportOpen: true });
    expect(html).toContain('aria-expanded="true"');
    expect(html.indexOf('src/a.ts')).toBeLessThan(html.indexOf('src/a.test.ts'));
  });

  it('lists every file in order when grouping is off', () => {
    const html = render({ groupSupport: false });
    expect(html).not.toContain('Tests, stories &amp; generated');
    expect(html.indexOf('src/a.test.ts')).toBeLessThan(html.indexOf('src/a.ts'));
    expect(html).toContain('aria-pressed="false"');
  });

  it('shows three tour sections in order and keeps toured tests at the top', () => {
    const html = render({ tourPaths: ['src/a.test.ts', 'src/a.test.ts'], supportOpen: true });
    expect(html.indexOf('In the tour')).toBeLessThan(html.indexOf('src/a.test.ts'));
    expect(html.indexOf('src/a.test.ts')).toBeLessThan(html.indexOf('Other changed files'));
    expect(html.indexOf('Other changed files')).toBeLessThan(html.indexOf('src/a.ts'));
    expect(html.indexOf('src/a.ts')).toBeLessThan(html.indexOf('Tests, stories &amp; generated'));
    expect(html.indexOf('Tests, stories &amp; generated')).toBeLessThan(
      html.indexOf('pnpm-lock.yaml'),
    );
    expect(html.match(/title="src\/a.test.ts"/g)).toHaveLength(1);
  });

  it('omits empty tour sections while filtering', () => {
    const html = render({ tourPaths: ['missing.ts'], files: [file('src/a.ts')] });
    expect(html).not.toContain('In the tour');
    expect(html).toContain('Other changed files');
    expect(html).not.toContain('Tests, stories &amp; generated');
  });
});
