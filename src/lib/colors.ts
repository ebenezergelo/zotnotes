const HEX_TO_COLOR: Record<string, string> = {
  '#ffd400': 'Yellow',
  '#fff5ad': 'Yellow',
  '#5fb236': 'Green',
  '#2ea8e5': 'Blue',
  '#a28ae5': 'Purple',
  '#e56eee': 'Pink',
  '#f19837': 'Orange',
  '#aaaaaa': 'Gray',
};

const FIXED_ORDER = ['Yellow', 'Green', 'Blue', 'Pink', 'Orange', 'Purple', 'Gray', 'Unknown'];

export function colorNameFromHex(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return 'Unknown';
  }

  const mapped = HEX_TO_COLOR[normalized];
  return mapped ?? `Unknown (${normalized})`;
}

function colorRank(colorName: string): number {
  const unknownIndex = FIXED_ORDER.indexOf('Unknown');
  const idx = FIXED_ORDER.indexOf(colorName);
  if (idx >= 0) {
    return idx;
  }
  if (colorName.startsWith('Unknown')) {
    return unknownIndex;
  }
  return unknownIndex + 1;
}

export function compareColorGroups(a: string, b: string): number {
  const rankDiff = colorRank(a) - colorRank(b);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  if (a.startsWith('Unknown') || b.startsWith('Unknown')) {
    return a.localeCompare(b);
  }

  return a.localeCompare(b);
}
