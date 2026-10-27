"use client";

import * as React from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "./button";
import type { ModelCombobox } from "@/types/base/base.types";

// Type for API fetcher function
type DataFetcher = () => Promise<ModelCombobox[]>;

interface ComboboxProps {
  // Option 1: Pass options directly (for static data or parent-managed)
  options?: ModelCombobox[];
  loading?: boolean;

  // Option 2: Pass a fetcher function (component manages loading)
  fetchOptions?: DataFetcher;

  // Transform function to convert API response to ModelCombobox[]
  transformData?: (data: any) => ModelCombobox[];

  value?: string;
  onValueChange: (value: string, text?: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
  readonly?: boolean;
  modal?: boolean;
  showSearch?: boolean;
  eagerLoading?: boolean; // If true, fetch data on mount instead of waiting for dropdown open
}

export function Combobox({
  options: externalOptions,
  fetchOptions,
  transformData,
  value,
  onValueChange,
  placeholder = "Lựa chọn...",
  searchPlaceholder = "Tìm kiếm...",
  emptyText = "Không tìm thấy kết quả.",
  loadingText = "Đang tải...",
  loading = false,
  className,
  disabled = false,
  readonly = false,
  modal = true,
  showSearch = true,
  eagerLoading = true,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);

  // Handle open state - prevent opening if readonly
  const handleOpenChange = (newOpen: boolean) => {
    if (readonly) return;
    setOpen(newOpen);
  };
  const [internalOptions, setInternalOptions] = React.useState<ModelCombobox[]>(
    [],
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasLoaded, setHasLoaded] = React.useState(false);

  // Determine which options to use
  const options = externalOptions || internalOptions;

  // Fetch data when dropdown opens (lazy loading)
  const loadData = React.useCallback(async () => {
    if (hasLoaded || externalOptions) return; // Skip if already loaded or using external options

    setIsLoading(true);
    try {
      let data: ModelCombobox[] = [];

      // Method 1: Use fetchOptions function
      if (fetchOptions) {
        data = await fetchOptions();
      }

      setInternalOptions(data);
      setHasLoaded(true);
    } catch (error) {
      console.error("Error loading combobox data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchOptions, transformData, hasLoaded, externalOptions]);

  // Load data when dropdown opens or immediately if eagerLoading is true
  React.useEffect(() => {
    if ((eagerLoading || open) && !hasLoaded && !externalOptions) {
      loadData();
    }
  }, [eagerLoading, open, loadData, hasLoaded, externalOptions]);

  const normalizeValue = (val?: string) => (val || "").trim().toLowerCase();
  const isSelectedValue = (optionValue?: string) =>
    normalizeValue(optionValue) === normalizeValue(value);

  const selectedOption = options.find((option) =>
    isSelectedValue(option.Value),
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between bg-white font-normal overflow-hidden",
            className,
          )}
          disabled={disabled}
        >
          <span className="flex-1 text-left min-w-0 block truncate">
            {selectedOption ? selectedOption.Text : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 z-[1000]"
        align="start"
        style={{ minWidth: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          {showSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            {isLoading || loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                  <span>{loadingText}</span>
                </div>
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.Value}
                      value={option.Text}
                      className={cn(
                        "cursor-pointer",
                        "flex w-full items-center gap-2",
                        isSelectedValue(option.Value) &&
                          "font-semibold text-primary",
                      )}
                      onSelect={(_) => {
                        const currentlySelected = isSelectedValue(option.Value);
                        const newValue = currentlySelected
                          ? ""
                          : option.Value || "";
                        const newText = currentlySelected
                          ? ""
                          : option.Text || "";
                        onValueChange(newValue, newText);
                        setOpen(false);
                      }}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center shrink-0",
                          isSelectedValue(option.Value)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </div>
                      <span className="flex-1 whitespace-normal break-words">
                        {option.Text}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
