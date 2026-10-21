import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { API_BASE_URL } from "./api";
import { API_ENDPOINTS } from "@/config/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${API_BASE_URL}${API_ENDPOINTS.File.UploadFile.GET}${path}`;
}

export const formatDate = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);

  // Helper function to pad single digits with a leading zero
  const pad = (num: number) => String(num).padStart(2, "0");

  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1); // Remember: Months are 0-indexed (Jan is 0)
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${day}/${month}/${year} - ${hours}:${minutes}`;
};
