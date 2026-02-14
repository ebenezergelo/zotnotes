import { BookOpenText, CheckCircle2, LoaderCircle, Search } from 'lucide-react';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ItemSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ItemPickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  items: ItemSummary[];
  isLoading: boolean;
  selectedItemKeys: string[];
  activeItemKey: string;
  onSelect: (item: ItemSummary) => void;
  dense?: boolean;
  showHints?: boolean;
}

function itemMetadataLine(item: ItemSummary): string {
  const creators = item.creators.trim();
  const year = item.year.trim();
  if (creators && year) {
    return `${creators} • ${year}`;
  }
  if (creators) {
    return creators;
  }
  if (year) {
    return year;
  }
  return '';
}

export function ItemPicker({
  query,
  onQueryChange,
  items,
  isLoading,
  selectedItemKeys,
  activeItemKey,
  onSelect,
  dense = false,
  showHints = true,
}: ItemPickerProps) {
  return (
    <div className={cn('rounded-md border border-border p-3', dense ? 'space-y-2.5' : 'space-y-3')}>
      <label className="inline-flex items-center gap-1.5 text-sm font-medium">
        <BookOpenText className="h-4 w-4 text-primary" />
        Items
      </label>
      {showHints && (
        <p className="text-xs text-muted-foreground">Search by title, creator, or year, then click items to add them to export.</p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search title / creators / year"
          value={query}
          className="pl-10"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <Command>
        <ScrollArea className={cn(dense ? 'max-h-64' : 'max-h-80')}>
          <CommandList>
            {isLoading && (
              <p className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Loading items...
              </p>
            )}
            {!isLoading && items.length === 0 && (
              <p className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
                No items found.
              </p>
            )}
            {!isLoading &&
              items.map((item) => (
                <CommandItem
                  key={item.key}
                  onClick={() => onSelect(item)}
                  className={cn(
                    item.key === activeItemKey && 'bg-muted',
                    selectedItemKeys.includes(item.key) && 'border-primary/40',
                    dense && 'py-1.5',
                  )}
                >
                  <BookOpenText className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.title}</p>
                    {itemMetadataLine(item) ? <p className="text-xs text-muted-foreground">{itemMetadataLine(item)}</p> : null}
                  </div>
                  {selectedItemKeys.includes(item.key) ? (
                    <span className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-medium text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Added
                    </span>
                  ) : null}
                </CommandItem>
              ))}
          </CommandList>
        </ScrollArea>
      </Command>
    </div>
  );
}
