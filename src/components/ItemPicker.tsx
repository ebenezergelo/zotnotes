import { Search } from 'lucide-react';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ItemSummary } from '@/lib/types';

interface ItemPickerProps {
  query: string;
  onQueryChange: (query: string) => void;
  items: ItemSummary[];
  isLoading: boolean;
  selectedItemKey: string;
  onSelect: (item: ItemSummary) => void;
}

export function ItemPicker({
  query,
  onQueryChange,
  items,
  isLoading,
  selectedItemKey,
  onSelect,
}: ItemPickerProps) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Item picker</label>
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
        <ScrollArea className="max-h-80">
          <CommandList>
            {isLoading && <p className="px-3 py-2 text-sm text-muted-foreground">Loading items...</p>}
            {!isLoading && items.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No items found.</p>}
            {!isLoading &&
              items.map((item) => (
                <CommandItem
                  key={item.key}
                  onClick={() => onSelect(item)}
                  className={item.key === selectedItemKey ? 'bg-muted' : undefined}
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.title || '(untitled)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.creators || 'Unknown author'}
                      {item.year ? ` • ${item.year}` : ''}
                    </p>
                  </div>
                </CommandItem>
              ))}
          </CommandList>
        </ScrollArea>
      </Command>
    </div>
  );
}
