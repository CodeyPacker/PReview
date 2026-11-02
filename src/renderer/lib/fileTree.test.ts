import { describe, expect, it } from 'vitest';
import { allFolderPaths, buildFileTree, foldersAbove, visibleRows } from './fileTree.ts';

const paths = [
  'README.md',
  'src/main/index.ts',
  'src/main/ipc/index.ts',
  'src/renderer/app.tsx',
  'docs/guide/start.md',
  'package.json',
];

describe('buildFileTree', () => {
  it('puts folders first and sorts each group by name', () => {
    const names = buildFileTree(paths).map((node) => node.name);
    expect(names).toEqual(['docs/guide', 'src', 'package.json', 'README.md']);
  });

  it('joins a folder that holds only one folder', () => {
    const [docs] = buildFileTree(paths);
    expect(docs).toMatchObject({ kind: 'folder', path: 'docs/guide', name: 'docs/guide' });
  });

  it('keeps folders that hold files or several folders apart', () => {
    const src = buildFileTree(paths).find((node) => node.path === 'src');
    expect(src?.kind === 'folder' && src.children.map((child) => child.path)).toEqual([
      'src/main',
      'src/renderer',
    ]);
  });
});

describe('visibleRows', () => {
  it('lists only the children of open folders, with their depth', () => {
    const tree = buildFileTree(paths);
    expect(visibleRows(tree, new Set()).map((row) => row.node.path)).toEqual([
      'docs/guide',
      'src',
      'package.json',
      'README.md',
    ]);
    const rows = visibleRows(tree, new Set(['src', 'src/main']));
    expect(rows.map((row) => [row.node.path, row.depth])).toEqual([
      ['docs/guide', 0],
      ['src', 0],
      ['src/main', 1],
      ['src/main/ipc', 2],
      ['src/main/index.ts', 2],
      ['src/renderer', 1],
      ['package.json', 0],
      ['README.md', 0],
    ]);
  });
});

describe('folder paths', () => {
  it('finds every folder', () => {
    expect([...allFolderPaths(buildFileTree(paths))].sort()).toEqual([
      'docs/guide',
      'src',
      'src/main',
      'src/main/ipc',
      'src/renderer',
    ]);
  });

  it('finds the folders to open to show a file', () => {
    const tree = buildFileTree(paths);
    expect(foldersAbove(tree, 'src/main/ipc/index.ts')).toEqual([
      'src',
      'src/main',
      'src/main/ipc',
    ]);
    expect(foldersAbove(tree, 'README.md')).toEqual([]);
  });
});
