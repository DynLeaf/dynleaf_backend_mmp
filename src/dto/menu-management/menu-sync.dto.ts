export interface MenuImportOptionsDto {
  dryRun?: boolean;
  createMissingCategories?: boolean;
  onDuplicate?: 'skip' | 'update' | 'create';
}

export interface MenuImportRequestDto {
  items: any[];
  options?: MenuImportOptionsDto;
}

export interface MenuImportResponseDto {
  outletId: string;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ index: number; name?: string; message: string }>;
  results: Array<{ index: number; status: 'created' | 'updated' | 'skipped' | 'failed'; id?: string; name?: string }>;
}

export interface MenuExportResponseDto {
  outletId: string;
  exportedAt: string;
  categories: any[];
  items: any[];
  addons: any[];
  combos: any[];
}

export interface MenuSyncPreviewRequestDto {
  sourceOutletId: string;
  targetOutletIds: string[];
  options?: MenuImportOptionsDto;
}

export interface MenuSyncRequestDto extends MenuSyncPreviewRequestDto {}
