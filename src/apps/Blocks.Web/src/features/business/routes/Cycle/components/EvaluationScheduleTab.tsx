import { format } from "date-fns";
import { Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/datepicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import type { EvaluationSchedule } from "@/features/business/types/cycle.types";

interface EvaluationScheduleTabProps {
    listEvaluationSchedule: EvaluationSchedule[];
    userOptions: { Value?: string; Text?: string }[];
    errors: { listEvaluationSchedule?: string };
    onAdd: () => void;
    onDelete: (id: string) => void;
    onChange: (id: string, field: keyof EvaluationSchedule, value: string) => void;
}

export function EvaluationScheduleTab({
    listEvaluationSchedule,
    userOptions,
    errors,
    onAdd,
    onDelete,
    onChange,
}: EvaluationScheduleTabProps) {
    return (
        <div className="grid gap-2">
            <div className="flex justify-between items-center">
                <Label>Thời gian biểu đánh giá</Label>
                <Button
                    type="button"
                    size="sm"
                    onClick={onAdd}
                    className="flex gap-2"
                >
                    <Plus className="w-4 h-4" /> Thêm hoạt động
                </Button>
            </div>
            {errors.listEvaluationSchedule && (
                <div className="text-sm text-red-500 bg-red-50 p-2 rounded-lg border border-red-200">
                    {errors.listEvaluationSchedule}
                </div>
            )}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Hoạt động</TableHead>
                            <TableHead className="w-[180px]">Bắt đầu</TableHead>
                            <TableHead className="w-[180px]">Kết thúc</TableHead>
                            <TableHead className="w-[200px]">Phụ trách</TableHead>
                            <TableHead className="w-[80px] text-center">
                                Thao tác
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {listEvaluationSchedule.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24">
                                    Chưa có dữ liệu
                                </TableCell>
                            </TableRow>
                        ) : (
                            listEvaluationSchedule.map((item) => (
                                <TableRow key={item.Id}>
                                    <TableCell>
                                        <Input
                                            value={item.ActivityName}
                                            onChange={(e) =>
                                                onChange(item.Id, "ActivityName", e.target.value)
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <DatePicker
                                            className="w-full"
                                            value={
                                                item.StartTime ? new Date(item.StartTime) : undefined
                                            }
                                            onChange={(date) =>
                                                onChange(
                                                    item.Id,
                                                    "StartTime",
                                                    date ? format(date, "yyyy-MM-dd") : "",
                                                )
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <DatePicker
                                            className="w-full"
                                            value={
                                                item.EndTime ? new Date(item.EndTime) : undefined
                                            }
                                            onChange={(date) =>
                                                onChange(
                                                    item.Id,
                                                    "EndTime",
                                                    date ? format(date, "yyyy-MM-dd") : "",
                                                )
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={item.LeadId}
                                            onValueChange={(value) =>
                                                onChange(item.Id, "LeadId", value)
                                            }
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Chọn người phụ trách" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {userOptions.map((user) => (
                                                    <SelectItem
                                                        key={user.Value}
                                                        value={user.Value || ""}
                                                    >
                                                        {user.Text}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => onDelete(item.Id)}
                                        >
                                            <Trash className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

