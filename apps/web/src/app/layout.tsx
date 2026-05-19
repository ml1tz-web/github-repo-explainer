import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'GitHub Repo Explainer',
  description:
    'Paste any public GitHub URL and get an AI-generated breakdown of the architecture, tech stack, and setup instructions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required by next-themes — the html class
    // is set by a pre-paint script before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
