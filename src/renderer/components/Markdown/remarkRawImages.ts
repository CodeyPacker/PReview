// A remark plugin. GitHub stores images pasted into a comment as <img> tags, and raw HTML is
// otherwise left out, so each tag becomes a Markdown image here.
interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

const IMAGE_TAG = /<img\b[^>]*>/gi;

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match?.[1] ?? match?.[2];
}

function imagesIn(html: string): MarkdownNode[] {
  return [...html.matchAll(IMAGE_TAG)].flatMap(([tag]) => {
    const url = attribute(tag, 'src');
    return url ? [{ type: 'image', url, alt: attribute(tag, 'alt') ?? '' } as MarkdownNode] : [];
  });
}

function replaceTags(parent: MarkdownNode): void {
  if (!parent.children) return;
  // Inside a paragraph an image sits with the text. Elsewhere it needs a paragraph of its own.
  const inline = parent.type === 'paragraph' || parent.type === 'heading';
  parent.children = parent.children.flatMap((node) => {
    if (node.type !== 'html' || !node.value) return [node];
    const images = imagesIn(node.value);
    if (images.length === 0) return [node];
    return inline ? images : [{ type: 'paragraph', children: images }];
  });
  parent.children.forEach(replaceTags);
}

export function remarkRawImages() {
  return (tree: MarkdownNode) => replaceTags(tree);
}
