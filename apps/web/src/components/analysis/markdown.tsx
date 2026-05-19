// Thin react-markdown wrapper. Styling lives in globals.css under .md-prose
// so we keep the prose theme in one place and don't inline Tailwind every
// time we render markdown.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
