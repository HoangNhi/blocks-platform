export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type ApiEnvelope<T> = {
  success?: boolean
  Success?: boolean
  statusCode?: number
  StatusCode?: number
  data?: T
  Data?: T
  message?: string | null
  Message?: string | null
}

export type PagingRequest = {
  textSearch?: string
  fromDate?: string | null
  toDate?: string | null
  pageIndex: number
  pageSize: number
}

export type PagingResponse<T> = {
  pageIndex: number
  pageSize: number
  totalRow: number
  data: T[]
}

export type ApiRequestOptions = {
  method?: ApiMethod
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  headers?: Record<string, string>
}
