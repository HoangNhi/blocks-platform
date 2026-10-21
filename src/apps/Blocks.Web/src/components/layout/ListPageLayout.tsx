import type { ReactNode } from "react";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
    InputGroup,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import type { RowSelectionState, OnChangeFn } from "@tanstack/react-table";

interface ListPageLayoutProps<TData> {
    columns: any[];
    data: TData[];
    totalRow: number;
    rowSelection: RowSelectionState;
    setRowSelection: OnChangeFn<RowSelectionState>;
    pageRequest: any;
    setPageRequest: (req: any | ((prev: any) => any)) => void;
    onRefresh: () => void;
    isLoading: boolean;

    filterContent?: ReactNode;
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    onResetFilters: () => void;
    filterGridCols?: string;
    searchInputClassName?: string;

    onAddClick?: () => void;
    onDeleteClick?: () => void;
    deleteDisabled?: boolean;
    extraActions?: ReactNode;
    tableContainerClassName?: string;

    showDeleteConfirm?: boolean;
    onDeleteConfirmChange?: (open: boolean) => void;
    onDeleteConfirm?: () => void;
    deleteItemCount?: number;
    isDeleteLoading?: boolean;

    children?: ReactNode;
    hideAdd?: boolean;
    compactToolbar?: boolean;
}

export function ListPageLayout<TData>({
    columns,
    data,
    totalRow,
    rowSelection,
    setRowSelection,
    pageRequest,
    setPageRequest,
    onRefresh,
    isLoading,
    filterContent,
    searchTerm,
    onSearchTermChange,
    onResetFilters,
    filterGridCols = "md:grid-cols-4",
    searchInputClassName = "col-span-1 bg-background",
    onAddClick,
    onDeleteClick,
    deleteDisabled,
    extraActions,
    showDeleteConfirm = false,
    onDeleteConfirmChange,
    onDeleteConfirm,
    deleteItemCount = 0,
    isDeleteLoading = false,
    children,
    hideAdd = false,
    compactToolbar = false,
    tableContainerClassName,
}: ListPageLayoutProps<TData>) {
    return (
        <div className="container mx-auto space-y-4">
            {!compactToolbar ? (
                <Card className="mb-4 bg-muted/40 shadow-none border-none p-0 sm:border-solid">
                    <CardContent className="p-4">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-medium">Lọc danh sách</h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                onClick={onResetFilters}
                            >
                                Đặt lại bộ lọc
                            </Button>
                        </div>
                        <div className={`grid grid-cols-1 gap-4 ${filterGridCols}`}>
                            {filterContent}

                            <InputGroup className={searchInputClassName}>
                                <InputGroupInput
                                    placeholder="Tìm kiếm..."
                                    value={searchTerm || ""}
                                    onChange={(e) => onSearchTermChange(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            setPageRequest((prev: any) => ({
                                                ...prev,
                                                TextSearch: searchTerm,
                                                PageIndex: 1,
                                            }));
                                        }
                                    }}
                                />
                                <InputGroupButton
                                    onClick={() => {
                                        setPageRequest((prev: any) => ({
                                            ...prev,
                                            TextSearch: searchTerm,
                                            PageIndex: 1,
                                        }));
                                    }}
                                >
                                    <SearchIcon />
                                </InputGroupButton>
                            </InputGroup>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            <div className={compactToolbar ? "grid grid-cols-1 gap-3 md:grid-cols-2 md:items-center" : "grid grid-cols-3 items-center justify-between"}>
                <div className={compactToolbar ? "flex items-center gap-2" : "col-span-2 flex items-center gap-2"}>
                    {!hideAdd && onAddClick && (
                        <Button size="sm" onClick={onAddClick}>
                            Thêm
                        </Button>
                    )}
                    {extraActions}
                    {onDeleteClick && (
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={onDeleteClick}
                            disabled={deleteDisabled}
                        >
                            Xóa
                        </Button>
                    )}
                </div>

                {compactToolbar ? (
                    <div className="flex items-center justify-end gap-2">
                        <InputGroup className="bg-background">
                            <InputGroupInput
                                placeholder="Tìm kiếm..."
                                value={searchTerm || ""}
                                onChange={(e) => onSearchTermChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        setPageRequest((prev: any) => ({
                                            ...prev,
                                            TextSearch: searchTerm,
                                            PageIndex: 1,
                                        }));
                                    }
                                }}
                            />
                            <InputGroupButton
                                onClick={() => {
                                    setPageRequest((prev: any) => ({
                                        ...prev,
                                        TextSearch: searchTerm,
                                        PageIndex: 1,
                                    }));
                                }}
                            >
                                <SearchIcon />
                            </InputGroupButton>
                        </InputGroup>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={onResetFilters}
                        >
                            Đặt lại
                        </Button>
                    </div>
                ) : null}
            </div>

            <DataTable
                columns={columns}
                data={data}
                totalRow={totalRow}
                rowSelection={rowSelection}
                setRowSelection={setRowSelection}
                pageRequest={pageRequest}
                setPageRequest={setPageRequest}
                onRefresh={onRefresh}
                isLoading={isLoading}
                containerClassName={tableContainerClassName}
            />

            {children}

            {onDeleteConfirmChange && onDeleteConfirm && (
                <ConfirmDeleteDialog
                    open={showDeleteConfirm}
                    onOpenChange={onDeleteConfirmChange}
                    onConfirm={onDeleteConfirm}
                    itemCount={deleteItemCount}
                    isLoading={isDeleteLoading}
                />
            )}
        </div>
    );
}

