import { compareColorGroups } from "./colors";
import type {
  ColorGroup,
  ExportInput,
  RenderAnnotation,
  TemplatePropertyKey,
} from "./types";
import { escapeSingleQuote } from "./utils";

function annotationQuoteLines(annotation: RenderAnnotation): string[] {
  const lines: string[] = [];

  const pageSuffix = annotation.pageLabel
    ? ` ([p. ${annotation.pageLabel}](zotero://select/library/items/${encodeURIComponent(annotation.key)}))`
    : "";
  if (annotation.text) {
    lines.push(`${annotation.text}${pageSuffix}`);
  } else if (annotation.comment) {
    lines.push(`${annotation.comment}${pageSuffix}`);
  } else if (pageSuffix) {
    lines.push(`(No text extracted)${pageSuffix}`);
  } else {
    lines.push("(No text extracted)");
  }

  if (annotation.text && annotation.comment) {
    lines.push(`Comment: ${annotation.comment}`);
  }

  if (annotation.imageMarkdownPath) {
    lines.push(`[[${annotation.imageMarkdownPath}]]`);
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

  return [
    "> [!INFO]",
    "> ",
    "> Abstract",
    "> ",
    ...lines.map((line) => `> ${line}`),
    "> ",
    "",
  ];
}

export function sortGroups(groups: ColorGroup[]): ColorGroup[] {
  return [...groups].sort((a, b) =>
    compareColorGroups(a.colorName, b.colorName),
  );
}

const DEFAULT_PROPERTY_ORDER: TemplatePropertyKey[] = [
  "title",
  "author",
  "year",
  "company",
];

const PROPERTY_LABELS: Record<TemplatePropertyKey, string> = {
  title: "Title",
  author: "Author",
  year: "Year",
  company: "Company",
};

function normalizePropertyOrder(
  order: TemplatePropertyKey[] | undefined,
): TemplatePropertyKey[] {
  const base = Array.isArray(order) ? order : [];
  const valid = base.filter(
    (key): key is TemplatePropertyKey => key in PROPERTY_LABELS,
  );
  const deduped = [...new Set(valid)];
  for (const fallback of DEFAULT_PROPERTY_ORDER) {
    if (!deduped.includes(fallback)) {
      deduped.push(fallback);
    }
  }
  return deduped;
}

function metadataValue(input: ExportInput, key: TemplatePropertyKey): string {
  if (key === "title") {
    return input.title;
  }
  if (key === "author") {
    return input.author;
  }
  if (key === "year") {
    return input.year;
  }
  return input.company;
}

export function generateMarkdown(input: ExportInput): string {
  const propertyOrder = normalizePropertyOrder(
    input.templateSettings?.propertyOrder,
  );
  const metadataLines = propertyOrder.map(
    (key) =>
      `${PROPERTY_LABELS[key]}: '${escapeSingleQuote(metadataValue(input, key))}'`,
  );

  const lines: string[] = [
    "---",
    "tags:",
    "  - type/source/paper",
    ...metadataLines,
    "---",
    "",
    "Project:",
    "",
  ];

  lines.push(...renderAbstractCallout(input.abstractText));

  lines.push("## Annotations", "");

  const groups = sortGroups(input.groupedAnnotations);
  for (const group of groups) {
    const override =
      input.templateSettings?.colorHeadingOverrides?.[group.colorName]?.trim();
    lines.push(`### ${override || group.colorName}`);

    group.annotations.forEach((annotation, index) => {
      const quoteLines = annotationQuoteLines(annotation);
      quoteLines.forEach((quoteLine) => lines.push(`> ${quoteLine}`));
      if (index < group.annotations.length - 1) {
        lines.push("");
      }
    });

    lines.push("");
  }

  return lines.join("\n").trimEnd().concat("\n");
}
