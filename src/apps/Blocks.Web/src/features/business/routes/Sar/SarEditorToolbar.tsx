import { useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Level } from "@tiptap/extension-heading";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
  Table,
  Link2,
  Trash2,
  ChevronDown,
  Indent,
  Outdent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title?: string;
  children?: React.ReactNode;
}

function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  icon: Icon,
  title,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-7 w-7 rounded-md border border-transparent transition-colors",
        "flex items-center justify-center",
        "hover:bg-slate-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        active && "bg-blue-100 border-blue-300 text-blue-700",
      )}
    >
      {children || <Icon className="h-4 w-4" />}
    </button>
  );
}

function ToolbarSeparator() {
  return <div className="h-4 w-px bg-slate-200 mx-1" />;
}

export function SarEditorToolbar({ editor }: { editor: Editor | null }) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [tableRows, setTableRows] = useState("3");
  const [tableCols, setTableCols] = useState("3");
  const [linkUrl, setLinkUrl] = useState("");

  if (!editor) {
    return <div className="h-10 bg-slate-50 border-b px-3 flex items-center gap-1" />;
  }

  // Helper to get current heading level
  const getCurrentHeadingLevel = () => {
    if (editor.isActive("heading", { level: 1 })) return 1;
    if (editor.isActive("heading", { level: 2 })) return 2;
    if (editor.isActive("heading", { level: 3 })) return 3;
    return null;
  };

  const currentHeadingLevel = getCurrentHeadingLevel();

  // Heading display text
  const getHeadingLabel = () => {
    if (currentHeadingLevel === 1) return "H1";
    if (currentHeadingLevel === 2) return "H2";
    if (currentHeadingLevel === 3) return "H3";
    return "Paragraph";
  };

  // Handle heading selection
  const handleHeadingSelect = (level: Level | null) => {
    if (level === null) {
      editor.commands.setParagraph();
    } else {
      editor.commands.setHeading({ level });
    }
    setHeadingOpen(false);
  };

  // Handle table insertion
  const handleInsertTable = () => {
    const rows = Math.max(1, parseInt(tableRows) || 3);
    const cols = Math.max(1, parseInt(tableCols) || 3);
    editor.commands.insertTable({ rows, cols, withHeaderRow: true });
    setTableOpen(false);
    setTableRows("3");
    setTableCols("3");
  };

  // Handle link insertion/editing
  const handleLinkConfirm = () => {
    if (!linkUrl) {
      editor.commands.unsetLink();
      setLinkOpen(false);
      setLinkUrl("");
      return;
    }

    if (!linkUrl.startsWith("http://") && !linkUrl.startsWith("https://")) {
      alert("URL phải bắt đầu bằng http:// hoặc https://");
      return;
    }

    editor.commands.setLink({ href: linkUrl });
    setLinkOpen(false);
    setLinkUrl("");
  };

  const handleLinkOpen = () => {
    const previousUrl = editor.getAttributes("link").href || "";
    setLinkUrl(previousUrl);
  };

  // Check if in a link
  const isInLink = editor.isActive("link");

  return (
    <div className="h-10 bg-slate-50 border-b px-3 flex items-center gap-1 overflow-x-auto">
      {/* Group 1: History */}
      <ToolbarButton
        onClick={() => editor.commands.undo()}
        disabled={!editor.can().undo()}
        icon={Undo2}
        title="Hoàn tác (Ctrl+Z)"
      />
      <ToolbarButton
        onClick={() => editor.commands.redo()}
        disabled={!editor.can().redo()}
        icon={Redo2}
        title="Làm lại (Ctrl+Y)"
      />
      <ToolbarSeparator />

      {/* Group 2: Text Styles */}
      <DropdownMenu open={headingOpen} onOpenChange={setHeadingOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "h-7 px-2 rounded-md border border-transparent transition-colors",
              "flex items-center justify-center gap-1 text-xs font-medium",
              "hover:bg-slate-200",
              currentHeadingLevel && "bg-blue-100 border-blue-300 text-blue-700",
            )}
            title="Kiểu heading"
          >
            {getHeadingLabel()}
            <ChevronDown className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => handleHeadingSelect(null)}
            className={!currentHeadingLevel ? "bg-blue-100" : ""}
          >
            Paragraph
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleHeadingSelect(1)}
            className={currentHeadingLevel === 1 ? "bg-blue-100" : ""}
          >
            <Heading1 className="h-4 w-4 mr-2" />
            Heading 1
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleHeadingSelect(2)}
            className={currentHeadingLevel === 2 ? "bg-blue-100" : ""}
          >
            <Heading2 className="h-4 w-4 mr-2" />
            Heading 2
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleHeadingSelect(3)}
            className={currentHeadingLevel === 3 ? "bg-blue-100" : ""}
          >
            <Heading3 className="h-4 w-4 mr-2" />
            Heading 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarSeparator />

      {/* Group 3: Text Formatting */}
      <ToolbarButton
        onClick={() => editor.commands.toggleBold()}
        active={editor.isActive("bold")}
        icon={Bold}
        title="Đậm (Ctrl+B)"
      />
      <ToolbarButton
        onClick={() => editor.commands.toggleItalic()}
        active={editor.isActive("italic")}
        icon={Italic}
        title="Nghiêng (Ctrl+I)"
      />
      <ToolbarButton
        onClick={() => editor.commands.toggleUnderline()}
        active={editor.isActive("underline")}
        icon={Underline}
        title="Gạch chân (Ctrl+U)"
      />
      <ToolbarSeparator />

      {/* Group 4: Text Alignment */}
      <ToolbarButton
        onClick={() => editor.commands.setTextAlign("left")}
        active={editor.isActive({ textAlign: "left" })}
        icon={AlignLeft}
        title="Căn trái"
      />
      <ToolbarButton
        onClick={() => editor.commands.setTextAlign("center")}
        active={editor.isActive({ textAlign: "center" })}
        icon={AlignCenter}
        title="Căn giữa"
      />
      <ToolbarButton
        onClick={() => editor.commands.setTextAlign("right")}
        active={editor.isActive({ textAlign: "right" })}
        icon={AlignRight}
        title="Căn phải"
      />
      <ToolbarButton
        onClick={() => editor.commands.setTextAlign("justify")}
        active={editor.isActive({ textAlign: "justify" })}
        icon={AlignJustify}
        title="Canh đều"
      />
      <ToolbarSeparator />

      {/* Group 5: List & Indent */}
      <ToolbarButton
        onClick={() => editor.commands.sinkListItem("listItem")}
        disabled={!editor.can().sinkListItem("listItem")}
        icon={Indent}
        title="Tăng thụt lề"
      />
      <ToolbarButton
        onClick={() => editor.commands.liftListItem("listItem")}
        disabled={!editor.can().liftListItem("listItem")}
        icon={Outdent}
        title="Giảm thụt lề"
      />

      {/* Group 6: Lists */}
      <ToolbarButton
        onClick={() => editor.commands.toggleBulletList()}
        active={editor.isActive("bulletList")}
        icon={List}
        title="Danh sách không đánh số"
      />
      <ToolbarButton
        onClick={() => editor.commands.toggleOrderedList()}
        active={editor.isActive("orderedList")}
        icon={ListOrdered}
        title="Danh sách đánh số"
      />
      <ToolbarSeparator />

      {/* Group 7: Insert */}
      <Popover open={tableOpen} onOpenChange={setTableOpen}>
        <PopoverTrigger asChild>
          <div>
            <ToolbarButton
              onClick={() => {}}
              icon={Table}
              title="Chèn bảng"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Số hàng</label>
              <Input
                type="number"
                min="1"
                value={tableRows}
                onChange={(e) => setTableRows(e.target.value)}
                placeholder="3"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Số cột</label>
              <Input
                type="number"
                min="1"
                value={tableCols}
                onChange={(e) => setTableCols(e.target.value)}
                placeholder="3"
                className="mt-1"
              />
            </div>
            <Button size="sm" onClick={handleInsertTable} className="w-full">
              Chèn bảng
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <div>
            <ToolbarButton
              onClick={() => handleLinkOpen()}
              active={isInLink}
              icon={Link2}
              title="Chèn/Chỉnh sửa liên kết"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">URL</label>
              <Input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleLinkConfirm} className="flex-1">
                {isInLink ? "Cập nhật" : "Thêm"}
              </Button>
              {isInLink && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    editor.commands.unsetLink();
                    setLinkOpen(false);
                    setLinkUrl("");
                  }}
                >
                  Xóa
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <ToolbarSeparator />

      {/* Group 8: Clear Formatting / Delete Table */}
      <ToolbarButton
        onClick={() => {
          if (editor.isActive('table')) {
            if (confirm('Xóa bảng này? Hành động này không thể hoàn tác.')) {
              editor.commands.deleteTable();
            }
          } else {
            editor.commands.clearNodes();
            editor.commands.unsetAllMarks();
          }
        }}
        icon={Trash2}
        title="Xóa định dạng / Xóa bảng"
      />
    </div>
  );
}
