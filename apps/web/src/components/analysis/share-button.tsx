'use client';

// Copy-to-clipboard for the current page URL. Pure client island so the
// analyze page can stay a Server Component.

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard write can fail in non-secure contexts. Silent — the user
      // can still copy the URL from the address bar.
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label="Copy share link"
    >
      {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
      {copied ? 'Copied' : 'Share'}
    </Button>
  );
}
