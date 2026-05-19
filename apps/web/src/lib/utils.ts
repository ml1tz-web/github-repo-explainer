import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn convention: cn() merges class names with Tailwind-aware dedup
// (e.g. cn("p-2", isLarge && "p-4") → "p-4", not "p-2 p-4").
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
