import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { CollectionDto } from "../types/collections.types";

interface Props {
  collections: CollectionDto[];
  selected: CollectionDto | null;
  selectedId: string | null;
  listLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  errorMessage: string | null;
  canCreate: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onLoadMore: () => void;
}

export function CollectionSelector({
  collections,
  selected,
  selectedId,
  listLoading,
  loadingMore,
  hasMore,
  errorMessage,
  canCreate,
  onSelect,
  onCreate,
  onLoadMore,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Chọn bộ sưu tập"
          aria-expanded={open}
          className="h-auto min-w-0 max-w-full justify-start px-1 text-left text-xl font-semibold"
        >
          <span className="min-w-0 truncate">
            {"Bộ sưu tập: " + (selected?.Name ?? "Chưa chọn")}
          </span>
          <ChevronDown className="size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput placeholder="Tìm trong các bộ sưu tập đã tải..." />
          <CommandList>
            {listLoading && collections.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Đang tải...</p>
            )}
            {errorMessage && (
              <p role="alert" className="p-3 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            {!listLoading && !errorMessage && (
              <CommandEmpty>
                Không có kết quả trong các bộ sưu tập đã tải.
              </CommandEmpty>
            )}
            <CommandGroup heading="Bộ sưu tập hiện có">
              {collections.map((collection) => (
                <CommandItem
                  key={collection.Id}
                  value={collection.Id}
                  keywords={[collection.Name]}
                  onSelect={() => {
                    onSelect(collection.Id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {collection.Name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {collection.Id.slice(0, 8)}
                  </span>
                  {selectedId === collection.Id && (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {hasMore && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full"
                disabled={loadingMore}
                onClick={onLoadMore}
              >
                {loadingMore ? "Đang tải thêm..." : "Tải thêm bộ sưu tập"}
              </Button>
            </div>
          )}
          {canCreate && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  onCreate();
                }}
              >
                <Plus className="size-4" />
                Tạo bộ sưu tập mới
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
