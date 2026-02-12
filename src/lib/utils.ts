import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function toRelativePath(fromFilePath: string, targetPath: string): string {
  const fromParts = normalizePath(fromFilePath).split('/').filter(Boolean);
  const toParts = normalizePath(targetPath).split('/').filter(Boolean);

  fromParts.pop();

  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i += 1;
  }

  const up = new Array(fromParts.length - i).fill('..');
  const down = toParts.slice(i);
  const result = [...up, ...down].join('/');
  return result.length > 0 ? result : '.';
}

export function escapeSingleQuote(value: string): string {
  return value.replace(/'/g, "''");
}

export function extractYear(rawDate: string): string {
  const match = rawDate.match(/\b(\d{4})\b/);
  return match?.[1] ?? '';
}
