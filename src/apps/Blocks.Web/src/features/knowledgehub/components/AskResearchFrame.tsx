import { Bot, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CollectionState,
  type CollectionContentState,
} from "./CollectionState";

export function AskResearchFrame({ state }: { state: CollectionContentState }) {
  if (state != "ready") return <CollectionState state={state} />;

  return (
    <Card className="min-h-64 justify-center shadow-none">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-xl bg-muted p-4">
          <Bot className="size-8 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold">Hỏi đáp & Nghiên cứu</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Hỏi đáp theo tài liệu, tìm kiếm và trích dẫn sẽ khả dụng trong các
          giai đoạn KnowledgeHub tiếp theo.
        </p>
        <Button disabled variant="secondary">
          <LockKeyhole className="size-4" />
          Bắt đầu hỏi đáp (chưa khả dụng)
        </Button>
      </CardContent>
    </Card>
  );
}
