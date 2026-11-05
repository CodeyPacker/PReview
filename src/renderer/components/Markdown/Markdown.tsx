// Markdown: Formats text written for GitHub, such as a description or a comment.
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.css';

export interface MarkdownProps {
  children: string;
}

const plugins = [remarkGfm, remarkBreaks];

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
};

// The text is untrusted. Raw HTML is left out, and react-markdown removes unsafe link URLs.
export function Markdown({ children }: MarkdownProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={plugins} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
