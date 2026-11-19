import z from "zod";
import type { CollectionInput } from "../types/collections.types";

const validCount = (value: string, limit: number) =>
  Array.from(value.trim()).length <= limit;

export const collectionFormSchema = z.object({
  Name: z
    .string()
    .refine((v) => !v.includes("\0"), "Tên không được chứa NUL")
    .refine((v) => v.trim().length > 0, "Tên bộ sưu tập là bắt buộc")
    .refine((v) => validCount(v, 200), "Tên tối đa 200 ký tự"),
  Description: z
    .string()
    .refine((v) => !v.includes("\0"), "Mô tả không được chứa NUL")
    .refine((v) => validCount(v, 2000), "Mô tả tối đa 2000 ký tự"),
});

export type CollectionFormValues = z.infer<typeof collectionFormSchema>;

export function toCollectionInput(v: CollectionFormValues): CollectionInput {
  return {
    Name: v.Name.trim(),
    Description: v.Description.trim() || null,
  };
}
