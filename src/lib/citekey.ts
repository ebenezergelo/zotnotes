import type { ZoteroItemData } from './types';

function normalizeCandidate(candidate: unknown): string {
  if (typeof candidate !== 'string') {
    return '';
  }
  return candidate.trim();
}

function extractFromExtra(extra: unknown): string {
  if (typeof extra !== 'string' || extra.trim().length === 0) {
    return '';
  }

  const patterns = [
    /^citation\s*key\s*:\s*(.+)$/i,
    /^citekey\s*:\s*(.+)$/i,
    /^bbt\s*citation\s*key\s*:\s*(.+)$/i,
  ];

  for (const line of extra.split(/\r?\n/)) {
    const trimmed = line.trim();
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  return '';
}

export function resolveCiteKey(item: ZoteroItemData): string {
  const data = item.data ?? {};

  const directCandidates = [
    (data as Record<string, unknown>).citationKey,
    (data as Record<string, unknown>).citekey,
    (data as Record<string, unknown>).bibtexKey,
    item.meta?.citationKey,
  ];

  for (const candidate of directCandidates) {
    const value = normalizeCandidate(candidate);
    if (value) {
      return value;
    }
  }

  const extraFromData = extractFromExtra((data as Record<string, unknown>).extra);
  if (extraFromData) {
    return extraFromData;
  }

  throw new Error(
    'Better BibTeX cite key is missing for this item. In Zotero, install Better BibTeX and ensure a citation key exists (for example in Extra: "Citation Key: mykey").',
  );
}
