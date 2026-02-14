import type { ItemPreview } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PreviewPanelProps {
  preview: ItemPreview | null;
}

export function PreviewPanel({ preview }: PreviewPanelProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Selected item preview</CardTitle>
        <CardDescription>Title, author list, year, and Better BibTeX cite key</CardDescription>
      </CardHeader>
      <CardContent>
        {!preview && <p className="text-sm text-muted-foreground">Choose an item to preview metadata.</p>}
        {preview && (
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="font-medium text-muted-foreground">Title</dt>
            <dd className="break-words">{preview.title || '-'}</dd>
            <dt className="font-medium text-muted-foreground">Authors</dt>
            <dd className="break-words">{preview.authors || '-'}</dd>
            <dt className="font-medium text-muted-foreground">Year</dt>
            <dd>{preview.year || '-'}</dd>
            <dt className="font-medium text-muted-foreground">Cite key</dt>
            <dd className="text-xs">{preview.citeKey || '-'}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
