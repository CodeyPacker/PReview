// Markdown: Formats text written for GitHub, such as a description or a comment.
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';
import { remarkRawImages } from './remarkRawImages.ts';

export interface MarkdownProps {
  children: string;
}

const plugins = [remarkGfm, remarkBreaks, remarkRawImages];

const components: Components = {
  // Links open in the browser, because the main process only lets new windows out to safe URLs.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  // The app's content security policy blocks images from other sites, so link to them instead.
  img: ({ src, alt }) => (
    <a href={typeof src === 'string' ? src : undefined} target="_blank" rel="noreferrer">
      {alt || 'Image'}
    </a>
  ),
  // Task list checkboxes have no label of their own.
  input: ({ checked }) => (
    <input type="checkbox" checked={checked} disabled aria-label={checked ? 'Done' : 'Not done'} />
  ),
};

// The text is untrusted. Raw HTML tags other than images are left out, and react-markdown removes unsafe link URLs.
export function Markdown({ children }: MarkdownProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={plugins} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
