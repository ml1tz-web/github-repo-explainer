// Thin react-markdown wrapper.
//
// Styling lives in globals.css under .md-prose so the prose theme stays in
// one place. Syntax highlighting for ``` code blocks comes from
// rehype-highlight; the theme is highlight.js's "github-dark", imported here
// (no need to ship it in the bundle when no markdown is rendered).

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { cn } from '@/lib/utils';

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn('md-prose', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
