export interface AppSettings {
  markdownDir: string;
  attachmentBaseDir: string;
  zoteroApiKey: string;
  zoteroBaseUrl: string;
}

export interface ZoteroItemData {
  key: string;
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface ZoteroCreator {
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface ItemSummary {
  key: string;
  title: string;
  creators: string;
  year: string;
}

export interface ItemPreview {
  key: string;
  title: string;
  authors: string;
  year: string;
  citeKey: string;
}

export interface AnnotationModel {
  key: string;
  attachmentKey: string;
  colorHex: string;
  colorName: string;
  text: string;
  comment: string;
  pageLabel: string;
  sortIndex: number;
  isImageSelection: boolean;
}

export interface AnnotationImagePlan {
  annotationKey: string;
  attachmentKey: string;
  fileName: string;
  absolutePath: string;
  relativePathFromMarkdown: string;
}

export interface ExportInput {
  title: string;
  author: string;
  year: string;
  company: string;
  abstractText: string;
  citeKey: string;
  groupedAnnotations: ColorGroup[];
}

export interface ColorGroup {
  colorName: string;
  annotations: RenderAnnotation[];
}

export interface RenderAnnotation {
  key: string;
  text: string;
  comment: string;
  pageLabel: string;
  imageMarkdownPath?: string;
  missingImageMessage?: string;
}

export interface ExportPlan {
  markdownPath: string;
  markdownContent: string;
  imagePlans: AnnotationImagePlan[];
}
