import { compareColorGroups } from './colors';
import type { ColorGroup, ExportInput, RenderAnnotation } from './types';
import { escapeSingleQuote } from './utils';

function annotationQuoteLines(annotation: RenderAnnotation): string[] {
  const lines: string[] = [];

  const pageSuffix = annotation.pageLabel ? ` (p. ${annotation.pageLabel})` : '';
  if (annotation.text) {
    lines.push(`${annotation.text}${pageSuffix}`);
  } else if (annotation.comment) {
    lines.push(`${annotation.comment}${pageSuffix}`);
  } else if (pageSuffix) {
    lines.push(`(No text extracted)${pageSuffix}`);
  } else {
    lines.push('(No text extracted)');
  }

  if (annotation.text && annotation.comment) {
    lines.push(`Comment: ${annotation.comment}`);
  }

  if (annotation.imageMarkdownPath) {
    lines.push(`![Selected area](${annotation.imageMarkdownPath})`);
  }

  if (annotation.missingImageMessage) {
    lines.push(`TODO: ${annotation.missingImageMessage}`);
  }

  return lines;
}

function renderAbstractCallout(abstractText: string): string[] {
  if (!abstractText.trim()) {
    return [];
  }

  const lines = abstractText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return ['> [!INFO]', '> ', '> Abstract', '> ', ...lines.map((line) => `> ${line}`), '> ', ''];
}

export function sortGroups(groups: ColorGroup[]): ColorGroup[] {
  return [...groups].sort((a, b) => compareColorGroups(a.colorName, b.colorName));
}

export function generateMarkdown(input: ExportInput): string {
  const lines: string[] = [
    '---',
    'tags:',
    '  - type/source/paper',
    `Title: '${escapeSingleQuote(input.title)}'`,
    `Author: '${escapeSingleQuote(input.author)}'`,
    `Year: '${escapeSingleQuote(input.year)}'`,
    `Company: '${escapeSingleQuote(input.company)}'`,
    '---',
    '',
    'Project:',
    '',
  ];

  lines.push(...renderAbstractCallout(input.abstractText));

  lines.push('## Notes', '');

  const groups = sortGroups(input.groupedAnnotations);
  for (const group of groups) {
    lines.push(`### ${group.colorName}`);

    group.annotations.forEach((annotation, index) => {
      const quoteLines = annotationQuoteLines(annotation);
      quoteLines.forEach((quoteLine) => lines.push(`> ${quoteLine}`));
      if (index < group.annotations.length - 1) {
        lines.push('>');
      }
    });

    lines.push('');
  }

  return lines.join('\n').trimEnd().concat('\n');
}
