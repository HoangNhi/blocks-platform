import { CloudUpload, FolderOpen, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CollectionState,
  type CollectionContentState,
} from "./CollectionState";

export function RepositoryFrame({ state }: { state: CollectionContentState }) {
  if (state != "ready") return <CollectionState state={state} />;

  return (
    <div className="grid min-w-0 gap-5">
      <Card className="border-dashed bg-muted/40 py-0 shadow-none">
        <CardContent className="flex flex-col items-center gap-3 p-7 text-center">
          <div className="rounded-xl bg-background p-3">
            <CloudUpload className="size-7 text-primary" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold">Kho tài liệu & Import</h2>
          <p className="max-w-lg text-sm text-muted-foreground">
            Tính năng tải và xử lý PDF, Markdown, TXT sẽ được phát triển ở giai
            đoạn tiếp theo.
          </p>
          <Button disabled>
            <LockKeyhole className="size-4" />
            Tải tài liệu (chưa khả dụng)
          </Button>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="size-4" />
            Tài liệu trong bộ sưu tập
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Chưa có tài liệu trong bộ sưu tập này.
        </CardContent>
      </Card>
    </div>
  );
}
