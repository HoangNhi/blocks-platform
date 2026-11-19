export interface CollectionDto {
  Id: string;
  Name: string;
  Description: string | null;
  CreatedAt: string;
  UpdatedAt: string;
  DocumentCount: number; // Always 0 in P02
}

export interface CollectionPageDto {
  Data: CollectionDto[];
  TotalRow: number;
  PageIndex: number;
  PageSize: number;
}

export interface CollectionInput {
  Name: string;
  Description: string | null;
}

export interface CollectionListParams {
  page_index: number;
  page_size: number;
}

export interface DeleteCollectionDto {
  Id: string;
}
