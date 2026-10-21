"use client";

import * as React from "react";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import { Command as CommandPrimitive, useCommandState } from "cmdk";
import { XIcon } from "lucide-react";

import { Command } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
  disable?: boolean;

  /** fixed option that can't be removed. */
  fixed?: boolean;

  /** Group the options by providing key. */
  [key: string]: string | boolean | undefined;
}
interface GroupOption {
  [key: string]: Option[];
}

interface MultipleSelectorProps {
  value?: Option[];
  defaultOptions?: Option[];

  /** manually controlled options */
  options?: Option[];
  placeholder?: string;

  /** Loading component. */
  loadingIndicator?: React.ReactNode;

  /** Debounce time for async search. Only work with `onSearch`. */
  delay?: number;

  /**
   * Only work with `onSearch` prop. Trigger search when `onFocus`.
   * For example, when user click on the input, it will trigger the search to get initial options.
   **/
  triggerSearchOnFocus?: boolean;

  /** async search */
  onSearch?: (value: string) => Promise<Option[]>;

  /**
   * sync search. This search will not showing loadingIndicator.
   * The rest props are the same as async search.
   * i.e.: creatable, groupBy, delay.
   **/
  onSearchSync?: (value: string) => Option[];
  onChange?: (options: Option[]) => void;

  /** Limit the maximum number of selected options. */
  maxSelected?: number;

  /** When the number of selected options exceeds the limit, the onMaxSelected will be called. */
  onMaxSelected?: (maxLimit: number) => void;

  /** Hide the placeholder when there are options selected. */
  hidePlaceholderWhenSelected?: boolean;
  disabled?: boolean;

  /** Group the options base on provided key. */
  groupBy?: string;
  className?: string;
  badgeClassName?: string;

  /**
   * First item selected is a default behavior by cmdk. That is why the default is true.
   * This is a workaround solution by add a dummy item.
   *
   * @reference: https://github.com/pacocoursey/cmdk/issues/171
   */
  selectFirstItem?: boolean;

  /** Allow user to create option when there is no option matched. */
  creatable?: boolean;

  /** Props of `Command` */
  commandProps?: React.ComponentPropsWithoutRef<typeof Command>;

  /** Props of `CommandInput` */
  inputProps?: Omit<
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>,
    "value" | "placeholder" | "disabled"
  >;

  /** hide the clear all button. */
  hideClearAllButton?: boolean;

  /** Keep dropdown open after selecting an option. */
  keepOpenOnSelect?: boolean;

  /** Explicit portal host for dialog-aware rendering. */
  portalContainer?: HTMLElement | null;
}

export interface MultipleSelectorRef {
  selectedValue: Option[];
  input: HTMLInputElement;
  focus: () => void;
  reset: () => void;
}

export function useDebounce<T>(value: T, delay?: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay || 500);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

function transToGroupOption(options: Option[], groupBy?: string) {
  if (options.length === 0) {
    return {};
  }

  if (!groupBy) {
    return {
      "": options,
    };
  }

  const groupOption: GroupOption = {};

  options.forEach((option) => {
    const key = (option[groupBy] as string) || "";

    if (!groupOption[key]) {
      groupOption[key] = [];
    }

    groupOption[key].push(option);
  });

  return groupOption;
}

function removePickedOption(groupOption: GroupOption, picked: Option[]) {
  const cloneOption = JSON.parse(JSON.stringify(groupOption)) as GroupOption;

  for (const [key, value] of Object.entries(cloneOption)) {
    cloneOption[key] = value.filter(
      (val) => !picked.find((p) => p.value === val.value),
    );
  }

  return cloneOption;
}

type DropdownPlacement = "top" | "bottom";
type DropdownStrategy = "viewport" | "container";

type DropdownPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: DropdownPlacement;
  strategy: DropdownStrategy;
};

const VIEWPORT_PADDING = 12;
const DROPDOWN_OFFSET = 8;
const DEFAULT_DROPDOWN_MAX_HEIGHT = 300;
const MIN_DROPDOWN_MAX_HEIGHT = 140;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolvePortalHost(explicitHost?: HTMLElement | null): HTMLElement {
  if (explicitHost instanceof HTMLElement) {
    return explicitHost;
  }

  return document.body;
}

function resolveViewportDropdownPos(triggerRect: DOMRect): DropdownPos {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const availableWidth = Math.max(120, viewportWidth - VIEWPORT_PADDING * 2);
  const width = Math.min(triggerRect.width, availableWidth);

  const minLeft = VIEWPORT_PADDING;
  const maxLeft = Math.max(minLeft, viewportWidth - VIEWPORT_PADDING - width);
  const left = clamp(triggerRect.left, minLeft, maxLeft);

  const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_PADDING;
  const spaceAbove = triggerRect.top - VIEWPORT_PADDING;
  const shouldOpenTop =
    spaceBelow < MIN_DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow;

  const availableSpace = Math.max(0, shouldOpenTop ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(
    DEFAULT_DROPDOWN_MAX_HEIGHT,
    Math.max(MIN_DROPDOWN_MAX_HEIGHT, availableSpace),
  );

  const rawTop = shouldOpenTop
    ? triggerRect.top - DROPDOWN_OFFSET - maxHeight
    : triggerRect.bottom + DROPDOWN_OFFSET;
  const minTop = VIEWPORT_PADDING;
  const maxTop = Math.max(
    minTop,
    viewportHeight - VIEWPORT_PADDING - maxHeight,
  );

  return {
    top: clamp(rawTop, minTop, maxTop),
    left,
    width,
    maxHeight,
    placement: shouldOpenTop ? "top" : "bottom",
    strategy: "viewport",
  };
}

function resolveContainerDropdownPos(
  triggerRect: DOMRect,
  container: HTMLElement,
): DropdownPos {
  const containerRect = container.getBoundingClientRect();
  const viewportTop = container.scrollTop;
  const viewportBottom = viewportTop + container.clientHeight;
  const viewportLeft = container.scrollLeft;
  const viewportRight = viewportLeft + container.clientWidth;

  const triggerTop = triggerRect.top - containerRect.top + container.scrollTop;
  const triggerBottom =
    triggerRect.bottom - containerRect.top + container.scrollTop;
  const triggerLeft =
    triggerRect.left - containerRect.left + container.scrollLeft;

  const availableWidth = Math.max(
    120,
    container.clientWidth - VIEWPORT_PADDING * 2,
  );
  const width = Math.min(triggerRect.width, availableWidth);
  const minLeft = viewportLeft + VIEWPORT_PADDING;
  const maxLeft = Math.max(minLeft, viewportRight - VIEWPORT_PADDING - width);
  const left = clamp(triggerLeft, minLeft, maxLeft);

  const spaceBelow = viewportBottom - triggerBottom - VIEWPORT_PADDING;
  const spaceAbove = triggerTop - viewportTop - VIEWPORT_PADDING;
  const shouldOpenTop =
    spaceBelow < MIN_DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow;

  const availableSpace = Math.max(0, shouldOpenTop ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(
    DEFAULT_DROPDOWN_MAX_HEIGHT,
    Math.max(MIN_DROPDOWN_MAX_HEIGHT, availableSpace),
  );

  const rawTop = shouldOpenTop
    ? triggerTop - DROPDOWN_OFFSET - maxHeight
    : triggerBottom + DROPDOWN_OFFSET;
  const minTop = viewportTop + VIEWPORT_PADDING;
  const maxTop = Math.max(
    minTop,
    viewportBottom - VIEWPORT_PADDING - maxHeight,
  );

  return {
    top: clamp(rawTop, minTop, maxTop),
    left,
    width,
    maxHeight,
    placement: shouldOpenTop ? "top" : "bottom",
    strategy: "container",
  };
}

const CommandEmpty = ({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) => {
  const render = useCommandState((state) => state.filtered.count === 0);

  if (!render) return null;

  return (
    <div
      className={cn("px-2 py-4 text-center text-sm", className)}
      cmdk-empty=""
      role="presentation"
      {...props}
    />
  );
};

CommandEmpty.displayName = "CommandEmpty";

const MultipleSelector = ({
  value,
  onChange,
  placeholder,
  defaultOptions: arrayDefaultOptions = [],
  options: arrayOptions,
  delay,
  onSearch,
  onSearchSync,
  loadingIndicator,

  maxSelected = Number.MAX_SAFE_INTEGER,
  onMaxSelected,
  hidePlaceholderWhenSelected,
  disabled,
  groupBy,
  className,
  badgeClassName,
  selectFirstItem: _selectFirstItem = true,
  creatable = false,
  triggerSearchOnFocus = false,
  commandProps,
  inputProps,
  hideClearAllButton = false,
  keepOpenOnSelect = false,
  portalContainer,
}: MultipleSelectorProps) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isSelectingRef = React.useRef(false);
  const [open, setOpen] = React.useState(false);
  const [onScrollbar, setOnScrollbar] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = React.useState<DropdownPos | null>(
    null,
  );

  const [selected, setSelected] = React.useState<Option[]>(value || []);

  const [options, setOptions] = React.useState<GroupOption>(
    transToGroupOption(arrayDefaultOptions, groupBy),
  );

  const [inputValue, setInputValue] = React.useState("");
  const debouncedSearchTerm = useDebounce(inputValue, delay || 500);

  const handleClickOutside = (event: MouseEvent | TouchEvent) => {
    if (isSelectingRef.current) {
      return;
    }

    const target = event.target as Node;
    const insideTrigger = containerRef.current?.contains(target);
    const insideDropdown = dropdownRef.current?.contains(target);
    if (!insideTrigger && !insideDropdown) {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleUnselect = React.useCallback(
    (option: Option) => {
      const newOptions = selected.filter((s) => s.value !== option.value);

      setSelected(newOptions);
      onChange?.(newOptions);
    },
    [onChange, selected],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current;

      if (input) {
        if (e.key === "Delete" || e.key === "Backspace") {
          if (input.value === "" && selected.length > 0) {
            const lastSelectOption = selected[selected.length - 1];

            // If last item is fixed, we should not remove it.
            if (!lastSelectOption.fixed) {
              handleUnselect(selected[selected.length - 1]);
            }
          }
        }

        // This is not a default behavior of the <input /> field
        if (e.key === "Escape") {
          if (keepOpenOnSelect) {
            setOpen(false);
          }
          input.blur();
        }
      }
    },
    [handleUnselect, keepOpenOnSelect, selected],
  );

  const handleDropdownWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const list = event.currentTarget;
      const atTop = list.scrollTop <= 0;
      const atBottom =
        list.scrollTop + list.clientHeight >= list.scrollHeight - 1;

      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
        event.preventDefault();
      }

      event.stopPropagation();
    },
    [],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchend", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchend", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchend", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !containerRef.current) {
      if (!open) setDropdownPos(null);
      return;
    }

    const updatePos = () => {
      const trigger = containerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const host = resolvePortalHost(portalContainer);
      const useContainerStrategy =
        portalContainer instanceof HTMLElement && host !== document.body;

      setDropdownPos(
        useContainerStrategy
          ? resolveContainerDropdownPos(triggerRect, host)
          : resolveViewportDropdownPos(triggerRect),
      );
    };

    updatePos();

    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);

    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, portalContainer]);

  useEffect(() => {
    if (value) {
      setSelected(value);
    }
  }, [value]);

  useEffect(() => {
    /** If `onSearch` is provided, do not trigger options updated. */
    if (onSearch) {
      return;
    }

    const sourceOptions = arrayOptions ?? arrayDefaultOptions;
    const newOption = transToGroupOption(sourceOptions, groupBy);

    if (JSON.stringify(newOption) !== JSON.stringify(options)) {
      setOptions(newOption);
    }
  }, [arrayDefaultOptions, arrayOptions, groupBy, onSearch, options]);

  useEffect(() => {
    /** sync search */

    const doSearchSync = () => {
      const res = onSearchSync?.(debouncedSearchTerm);

      setOptions(transToGroupOption(res || [], groupBy));
    };

    const exec = async () => {
      if (!onSearchSync || !open) return;

      if (triggerSearchOnFocus) {
        doSearchSync();
      }

      if (debouncedSearchTerm) {
        doSearchSync();
      }
    };

    void exec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, groupBy, open, triggerSearchOnFocus]);

  useEffect(() => {
    /** async search */

    const doSearch = async () => {
      setIsLoading(true);
      const res = await onSearch?.(debouncedSearchTerm);

      setOptions(transToGroupOption(res || [], groupBy));
      setIsLoading(false);
    };

    const exec = async () => {
      if (!onSearch || !open) return;

      if (triggerSearchOnFocus) {
        await doSearch();
      }

      if (debouncedSearchTerm) {
        await doSearch();
      }
    };

    void exec();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, groupBy, open, triggerSearchOnFocus]);

  const selectables = React.useMemo<GroupOption>(
    () => removePickedOption(options, selected),
    [options, selected],
  );

  /** Avoid Creatable Selector freezing or lagging when paste a long string. */
  const commandFilter = React.useCallback(() => {
    if (commandProps?.filter) {
      return commandProps.filter;
    }

    if (creatable) {
      return (value: string, search: string) => {
        return value.toLowerCase().includes(search.toLowerCase()) ? 1 : -1;
      };
    }

    // Using default filter in `cmdk`. We don&lsquo;t have to provide it.
    return undefined;
  }, [creatable, commandProps?.filter]);

  return (
    <Command
      ref={containerRef}
      {...commandProps}
      onKeyDown={(e) => {
        handleKeyDown(e);
        commandProps?.onKeyDown?.(e);
      }}
      className={cn(
        "h-auto overflow-visible bg-transparent",
        commandProps?.className,
      )}
      shouldFilter={
        commandProps?.shouldFilter !== undefined
          ? commandProps.shouldFilter
          : !onSearch
      } // When onSearch is provided, we don&lsquo;t want to filter the options. You can still override it.
      filter={commandFilter()}
    >
      <div
        className={cn(
          "border-input focus-within:border-ring focus-within:ring-ring/50 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40 has-aria-invalid:border-destructive relative min-h-[38px] rounded-md border text-sm transition-[color,box-shadow] outline-none focus-within:ring-[3px] has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50",
          {
            "p-1": selected.length !== 0,
            "cursor-text": !disabled && selected.length !== 0,
          },
          !hideClearAllButton && "pr-9",
          className,
        )}
        onClick={() => {
          if (disabled) return;
          inputRef?.current?.focus();
        }}
      >
        <div className="flex flex-wrap gap-1">
          {selected.map((option) => {
            return (
              <div
                key={option.value}
                className={cn(
                  "animate-fadeIn bg-background text-secondary-foreground hover:bg-background relative inline-flex h-7 cursor-default items-center rounded-md border pr-7 pl-2 text-xs font-medium transition-all disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-fixed:pr-2",
                  badgeClassName,
                )}
                data-fixed={option.fixed}
                data-disabled={disabled || undefined}
              >
                {option.label}
                <button
                  className="text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute -inset-y-px -right-px flex size-7 items-center justify-center rounded-r-md border border-transparent p-0 outline-hidden transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleUnselect(option);
                    }
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => handleUnselect(option)}
                  aria-label="Remove"
                >
                  <XIcon size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          {/* Avoid having the "Search" Icon */}
          <CommandPrimitive.Input
            {...inputProps}
            key="multi-select-input"
            ref={inputRef}
            value={inputValue}
            disabled={disabled}
            onValueChange={(value) => {
              setInputValue(value);
              inputProps?.onValueChange?.(value);
            }}
            onBlur={(event) => {
              if (isSelectingRef.current) {
                inputProps?.onBlur?.(event);
                return;
              }

              if (keepOpenOnSelect) {
                inputProps?.onBlur?.(event);
                return;
              }

              window.requestAnimationFrame(() => {
                const activeElement = document.activeElement;
                const activeInsideDropdown =
                  activeElement instanceof Node &&
                  dropdownRef.current?.contains(activeElement);

                if (!activeInsideDropdown && !onScrollbar) {
                  setOpen(false);
                }
              });

              inputProps?.onBlur?.(event);
            }}
            onFocus={(event) => {
              setOpen(true);

              if (triggerSearchOnFocus) {
                onSearch?.(debouncedSearchTerm);
              }

              inputProps?.onFocus?.(event);
            }}
            placeholder={
              hidePlaceholderWhenSelected && selected.length !== 0
                ? ""
                : placeholder
            }
            className={cn(
              "placeholder:text-muted-foreground/70 flex-1 bg-transparent outline-hidden disabled:cursor-not-allowed",
              {
                "w-full": hidePlaceholderWhenSelected,
                "px-3 py-2": selected.length === 0,
                "ml-1": selected.length !== 0,
              },
              inputProps?.className,
            )}
          />
          <button
            key="multi-select-clear-all"
            type="button"
            onClick={() => {
              setSelected(selected.filter((s) => s.fixed));
              onChange?.(selected.filter((s) => s.fixed));
            }}
            className={cn(
              "text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute top-0 right-0 flex size-9 items-center justify-center rounded-md border border-transparent transition-[color,box-shadow] outline-none focus-visible:ring-[3px]",
              (hideClearAllButton ||
                disabled ||
                selected.length < 1 ||
                selected.filter((s) => s.fixed).length === selected.length) &&
                "hidden",
            )}
            aria-label="Clear all"
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {open &&
        dropdownPos &&
        createPortal(
          <div
            className={cn(
              "bg-popover text-popover-foreground z-[9999] overflow-hidden rounded-md border shadow-lg",
              dropdownPos.strategy === "container" ? "absolute" : "fixed",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "pointer-events-auto",
            )}
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
            data-state={open ? "open" : "closed"}
            data-ms-dropdown="true"
            data-placement={dropdownPos.placement}
            data-ms-strategy={dropdownPos.strategy}
            ref={dropdownRef}
            onMouseEnter={() => setOnScrollbar(true)}
            onMouseLeave={() => setOnScrollbar(false)}
          >
            <div
              className="overflow-y-auto overflow-x-hidden scroll-py-1 p-1 overscroll-contain"
              style={{ maxHeight: dropdownPos.maxHeight }}
              data-ms-scroll-container="true"
              data-testid="multi-select-scroll-container"
              onWheelCapture={handleDropdownWheel}
            >
              {isLoading ? (
                <>{loadingIndicator}</>
              ) : (
                <>
                  {Object.entries(selectables).map(([key, dropdowns]) => (
                    <div key={key}>
                      {key && (
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          {key}
                        </div>
                      )}
                      {dropdowns.map((option) => (
                        <div
                          key={option.value}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (option.disable) return;
                            if (selected.length >= maxSelected) {
                              onMaxSelected?.(selected.length);
                              return;
                            }
                            if (keepOpenOnSelect) {
                              isSelectingRef.current = true;
                            }
                            if (!keepOpenOnSelect) {
                              setInputValue("");
                            }
                            const newOptions = [...selected, option];
                            setSelected(newOptions);
                            onChange?.(newOptions);
                            if (keepOpenOnSelect) {
                              window.requestAnimationFrame(() => {
                                inputRef.current?.focus();
                                setOpen(true);
                                window.setTimeout(() => {
                                  isSelectingRef.current = false;
                                }, 0);
                              });
                            }
                          }}
                          className={cn(
                            "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none hover:bg-accent hover:text-accent-foreground",
                            option.disable &&
                              "pointer-events-none cursor-not-allowed opacity-50",
                          )}
                        >
                          {option.label}
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>,
          resolvePortalHost(portalContainer),
        )}
    </Command>
  );
};

MultipleSelector.displayName = "MultipleSelector";
export default MultipleSelector;
