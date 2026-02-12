import { colorNameFromHex } from './colors';
import { generateMarkdown } from './markdown';
import type {
  AnnotationImagePlan,
  AnnotationModel,
  ColorGroup,
  RenderAnnotation,
  ZoteroCreator,
  ZoteroItemData,
} from './types';
import { extractYear, normalizePath, toRelativePath } from './utils';

function creatorToString(creator: ZoteroCreator): string {
  if (creator.lastName || creator.firstName) {
    const last = creator.lastName?.trim() ?? '';
    const first = creator.firstName?.trim() ?? '';
    return [last, first].filter(Boolean).join(', ');
  }

  return creator.name?.trim() ?? '';
}

export interface ExportPreparationInput {
  markdownDir: string;
  attachmentBaseDir: string;
  citeKey: string;
  item: ZoteroItemData;
  annotations: AnnotationModel[];
}

export interface PreparedExport {
  markdownPath: string;
  title: string;
  author: string;
  year: string;
  company: string;
  abstractText: string;
  groupedAnnotations: ColorGroup[];
  imagePlans: AnnotationImagePlan[];
}

function getField(item: ZoteroItemData, key: string): string {
  const value = (item.data?.[key] as string | undefined) ?? '';
  return typeof value === 'string' ? value.trim() : '';
}

function buildAuthor(item: ZoteroItemData): string {
  const creators = (item.data?.creators as ZoteroCreator[] | undefined) ?? [];
  return creators.map(creatorToString).filter(Boolean).join('; ');
}

function resolveCompany(item: ZoteroItemData): string {
  // Zotero item types vary; publisher/institution/company cover the common publication records.
  const candidates = ['publisher', 'institution', 'company', 'university'];
  for (const key of candidates) {
    const value = getField(item, key);
    if (value) {
      return value;
    }
  }
  return '';
}

function groupAnnotations(annotations: Array<RenderAnnotation & { __colorName: string }>): ColorGroup[] {
  const grouped = new Map<string, RenderAnnotation[]>();

  for (const annotation of annotations) {
    const colorName = annotation.__colorName;
    if (!grouped.has(colorName)) {
      grouped.set(colorName, []);
    }

    const { __colorName: _, ...renderAnnotation } = annotation;
    grouped.get(colorName)?.push(renderAnnotation);
  }

  return [...grouped.entries()].map(([colorName, items]) => ({ colorName, annotations: items }));
}

export function prepareExport(input: ExportPreparationInput): PreparedExport {
  const citeDir = normalizePath(`${input.attachmentBaseDir}/attachment/${input.citeKey}`);
  const markdownPath = normalizePath(`${input.markdownDir}/@${input.citeKey}.md`);

  let imageCounter = 0;
  const imagePlans: AnnotationImagePlan[] = [];

  const renderAnnotations: Array<RenderAnnotation & { __colorName: string }> = input.annotations
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((annotation) => {
      const render: RenderAnnotation & { __colorName: string } = {
        key: annotation.key,
        text: annotation.text.trim(),
        comment: annotation.comment.trim(),
        pageLabel: annotation.pageLabel.trim(),
        __colorName: annotation.colorName,
      };

      if (annotation.isImageSelection) {
        imageCounter += 1;
        const fileName = `image_${imageCounter}.png`;
        const absolutePath = normalizePath(`${citeDir}/${fileName}`);
        const relativePathFromMarkdown = toRelativePath(markdownPath, absolutePath);

        imagePlans.push({
          annotationKey: annotation.key,
          attachmentKey: annotation.attachmentKey,
          fileName,
          absolutePath,
          relativePathFromMarkdown,
        });

        render.imageMarkdownPath = relativePathFromMarkdown;
      }

      return render;
    });

  return {
    markdownPath,
    title: getField(input.item, 'title'),
    author: buildAuthor(input.item),
    year: extractYear(getField(input.item, 'date')),
    company: resolveCompany(input.item),
    abstractText: getField(input.item, 'abstractNote'),
    groupedAnnotations: groupAnnotations(renderAnnotations),
    imagePlans,
  };
}

export function renderPreparedExport(prepared: PreparedExport): string {
  return generateMarkdown({
    title: prepared.title,
    author: prepared.author,
    year: prepared.year,
    company: prepared.company,
    abstractText: prepared.abstractText,
    citeKey: '',
    groupedAnnotations: prepared.groupedAnnotations,
  });
}

export function addMissingImageTodo(prepared: PreparedExport, annotationKey: string, message: string): PreparedExport {
  const groupedAnnotations = prepared.groupedAnnotations.map((group) => ({
    ...group,
    annotations: group.annotations.map((annotation) => {
      if (annotation.key !== annotationKey) {
        return annotation;
      }
      return {
        ...annotation,
        imageMarkdownPath: undefined,
        missingImageMessage: message,
      };
    }),
  }));

  return {
    ...prepared,
    groupedAnnotations,
  };
}

export function normalizeAnnotation(raw: ZoteroItemData, attachmentKey: string, sortIndex: number): AnnotationModel {
  const data = raw.data ?? {};
  return {
    key: raw.key,
    attachmentKey,
    colorHex: ((data.annotationColor as string) ?? '').trim().toLowerCase(),
    colorName: colorNameFromHex(((data.annotationColor as string) ?? '').trim().toLowerCase()),
    text: ((data.annotationText as string) ?? '').trim(),
    comment: ((data.annotationComment as string) ?? '').trim(),
    pageLabel: ((data.annotationPageLabel as string) ?? '').trim(),
    sortIndex,
    isImageSelection: ((data.annotationType as string) ?? '').toLowerCase() === 'image',
  };
}
