export interface FileNode {
  kind: 'file';
  // The file's full path.
  path: string;
  name: string;
}

export interface FolderNode {
  kind: 'folder';
  // The folder's full path. Folders that hold only one folder are joined, so this is the
  // innermost one.
  path: string;
  // Shown name. 'src/main' when src holds only main.
  name: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | FolderNode;

export interface TreeRow {
  node: TreeNode;
  depth: number;
}

interface Draft {
  folders: Map<string, Draft>;
  files: string[];
}

function sorted(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : 1);
}

function toNodes(draft: Draft, parent: string): TreeNode[] {
  const folders = [...draft.folders.keys()].sort(sorted).map((name): FolderNode => {
    let path = parent ? `${parent}/${name}` : name;
    let label = name;
    let inner = draft.folders.get(name) as Draft;
    // A folder with nothing but one folder folds into it, like in an editor's explorer.
    while (inner.files.length === 0 && inner.folders.size === 1) {
      const [only] = [...inner.folders.keys()] as [string];
      path = `${path}/${only}`;
      label = `${label}/${only}`;
      inner = inner.folders.get(only) as Draft;
    }
    return { kind: 'folder', path, name: label, children: toNodes(inner, path) };
  });
  const files = [...draft.files].sort(sorted).map((name): FileNode => ({
    kind: 'file',
    path: parent ? `${parent}/${name}` : name,
    name,
  }));
  return [...folders, ...files];
}

// The folders and files of a list of file paths. Folders come first, each group by name.
export function buildFileTree(paths: readonly string[]): TreeNode[] {
  const root: Draft = { folders: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split('/');
    const name = parts.pop() as string;
    let folder = root;
    for (const part of parts) {
      let next = folder.folders.get(part);
      if (!next) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(part, next);
      }
      folder = next;
    }
    folder.files.push(name);
  }
  return toNodes(root, '');
}

// The rows on show: every node under an open folder.
export function visibleRows(nodes: readonly TreeNode[], open: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (list: readonly TreeNode[], depth: number) => {
    for (const node of list) {
      rows.push({ node, depth });
      if (node.kind === 'folder' && open.has(node.path)) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return rows;
}

// Every folder path in the tree, to open them all.
export function allFolderPaths(nodes: readonly TreeNode[]): Set<string> {
  const paths = new Set<string>();
  const walk = (list: readonly TreeNode[]) => {
    for (const node of list) {
      if (node.kind === 'folder') {
        paths.add(node.path);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

// The folders to open to show a file: every folder node on the way to it.
export function foldersAbove(nodes: readonly TreeNode[], filePath: string): string[] {
  const found: string[] = [];
  let list = nodes;
  for (;;) {
    const folder = list.find(
      (node): node is FolderNode => node.kind === 'folder' && filePath.startsWith(`${node.path}/`),
    );
    if (!folder) return found;
    found.push(folder.path);
    list = folder.children;
  }
}
