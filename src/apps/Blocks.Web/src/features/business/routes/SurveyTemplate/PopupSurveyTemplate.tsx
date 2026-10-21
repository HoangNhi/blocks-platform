import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Loader2, Edit3, Eye, ArrowLeft } from "lucide-react";
import { SurveyForm } from "../SurveyCampaign/components/SurveyForm";
import type { SurveyView } from "../../types/survey-campaign.types";
import { TopicListEditor } from "../../components/TopicListEditor";
import { useSurveyTopics } from "../../hooks/useSurveyTopics";
import type { SurveyTemplate } from "../../types/survey-template.types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  title: z.string().min(1, "Vui lòng nhập tiêu đề"),
  stakeholderType: z.string().min(1, "Vui lòng chọn loại đối tượng"),
  description: z.string().optional(),
  isActived: z.boolean(),
});

const PopupSurveyTemplate = ({
  surveyTemplate,
  isOpen,
  onOpenChange,
  saveChange,
  isLoading,
}: {
  surveyTemplate: SurveyTemplate | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (
    data: SurveyTemplate & { IsEdit: boolean },
    isAddMore: boolean,
  ) => void;
  isLoading?: boolean;
}) => {
  const [id, setId] = useState<string>(surveyTemplate?.Id || uuidv4());

  const { listTopic, setListTopic, collapsedTopics, handlers } =
    useSurveyTopics(surveyTemplate?.ListTopic || []);

  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: surveyTemplate?.Title || "",
      stakeholderType: surveyTemplate?.StakeholderType?.toString() || "1",
      description: surveyTemplate?.Description || "",
      isActived: surveyTemplate?.IsActived ?? true,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    const payload = {
      Id: id,
      Title: values.title,
      StakeholderType: parseInt(values.stakeholderType),
      Description: values.description || "",
      IsActived: values.isActived,
      ListTopic: listTopic,
      IsEdit: surveyTemplate?.IsEdit || false,
    } as SurveyTemplate & { IsEdit: boolean };

    saveChange(payload, isAddMore);
  };

  const handleModeChange = (newMode: "edit" | "preview") => {
    setMode(newMode);
  };

  useEffect(() => {
    if (surveyTemplate) {
      setId(surveyTemplate.Id || uuidv4());
      form.reset({
        title: surveyTemplate.Title || "",
        stakeholderType: surveyTemplate.StakeholderType?.toString() || "1",
        description: surveyTemplate.Description || "",
        isActived: surveyTemplate.IsActived ?? true,
      });
      setListTopic(surveyTemplate.ListTopic || []);
    }
  }, [surveyTemplate, setListTopic, form]);

  const getPreviewData = (): SurveyView => {
    const values = form.getValues();
    return {
      Id: id,
      Name: values.title || "Tiêu đề mẫu (Xem trước)",
      StakeholderType: parseInt(values.stakeholderType),
      IsSessionCompleted: false,
      ListTopic:
        listTopic as unknown as import("../../types/survey-campaign.types").SurveyViewTopic[],
    };
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 w-full flex flex-col focus:outline-none overflow-hidden duration-300 transition-all",
          mode === "preview"
            ? "max-w-none w-screen h-screen rounded-none border-0 data-[state=open]:slide-in-from-bottom-0"
            : "sm:max-w-4xl max-h-[90vh]",
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        style={
          mode === "preview"
            ? {
                maxWidth: "100vw",
                width: "100vw",
                height: "100vh",
              }
            : undefined
        }
      >
        <Form {...form}>
          <form
            className="flex flex-col w-full min-h-0 h-full"
            onSubmit={form.handleSubmit((values) => onSubmit(values, false))}
          >
            <DialogHeader
              className={cn(
                "p-6 pb-4 border-b shrink-0 bg-white z-10 transition-all",
                mode === "preview" ? "py-4 shadow-sm" : "",
              )}
            >
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {mode === "preview" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMode("edit")}
                      className="mr-2"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  )}
                  <span>
                    {surveyTemplate?.IsEdit
                      ? "Cập nhật mẫu khảo sát"
                      : "Thêm mới mẫu khảo sát"}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Tabs
                    value={mode}
                    onValueChange={(v) =>
                      handleModeChange(v as "edit" | "preview")
                    }
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="edit">
                        <Edit3 size={16} className="mr-2" /> Soạn thảo
                      </TabsTrigger>
                      <TabsTrigger value="preview">
                        <Eye size={16} className="mr-2" /> Xem trước
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Edit Mode Content - Keep mounted but hide when in preview */}
            <div
              className={cn(
                "flex-1 overflow-y-auto bg-gray-50/50 p-6 min-h-0",
                mode === "preview" && "hidden",
              )}
            >
              <div className="pb-6">
                <div className="grid gap-4 pb-6 grid-cols-2">
                  <div className="grid gap-2 col-span-2">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                            Tiêu đề
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              required
                              maxLength={255}
                              placeholder="Nhập tiêu đề"
                              className="bg-white"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="col-span-2 grid gap-2 grid-cols-2 items-start">
                    <div className="grid gap-2">
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mô tả</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="Nhập mô tả"
                                className="min-h-[120px] bg-white resize-y"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid gap-2">
                      <div className="grid gap-2">
                        <FormField
                          control={form.control}
                          name="stakeholderType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                                Loại đối tượng
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full bg-white">
                                    <SelectValue placeholder="Chọn loại đối tượng" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="1">Sinh viên</SelectItem>
                                  <SelectItem value="2">
                                    Cựu sinh viên
                                  </SelectItem>
                                  <SelectItem value="4">Giảng viên</SelectItem>
                                  <SelectItem value="3">
                                    Nhà tuyển dụng
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid gap-3">
                        <FormField
                          control={form.control}
                          name="isActived"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Trạng thái</FormLabel>
                              <Select
                                onValueChange={(val) =>
                                  field.onChange(val === "true")
                                }
                                defaultValue={field.value ? "true" : "false"}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full bg-white">
                                    <SelectValue placeholder="Chọn trạng thái" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectGroup>
                                    <SelectItem value="true">
                                      Hoạt động
                                    </SelectItem>
                                    <SelectItem value="false">
                                      Không hoạt động
                                    </SelectItem>
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <TopicListEditor
                  listTopic={listTopic}
                  collapsedTopics={collapsedTopics}
                  handlers={handlers}
                />
              </div>
            </div>

            {mode === "preview" && (
              <div className="flex-1 overflow-y-auto bg-gray-50/50 min-h-0">
                <SurveyForm
                  campaign={getPreviewData()}
                  isPreview={true}
                  onSubmit={() => {
                    toast.success("Đây chỉ là bản xem trước!");
                  }}
                />
              </div>
            )}

            {mode === "edit" && (
              <DialogFooter className="p-6 pt-4 border-t shrink-0 bg-white z-10">
                <DialogClose asChild>
                  <Button variant="outline">Hủy</Button>
                </DialogClose>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Lưu
                </Button>
                {!surveyTemplate?.IsEdit && (
                  <Button
                    type="button"
                    onClick={form.handleSubmit((values) =>
                      onSubmit(values, true),
                    )}
                    disabled={isLoading}
                  >
                    {isLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Lưu và thêm tiếp
                  </Button>
                )}
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PopupSurveyTemplate;
