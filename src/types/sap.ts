export interface MORecord {
  functionalLoc: string;
  plannerGroup: string;
  code: string;
  systemStatus: string;
  equipment: string;
  assembly: string;
  maintenancePlan: string;
  isClosed: boolean;
  isMaintPlan: boolean;
  noEq: boolean;
  noBom: boolean;
  order: string;
  orderType: string;
  description: string;
  createdOn: string;
  department?: string;
}

export interface DeptSummaryRow {
  department: string;
  manual: number;
  maintPlan: number;
  total: number;
  closed: number;
  open: number;
  noEq: number;
  noBom: number;
  rate: number;
  records: MORecord[];
}

export interface DashboardTotals {
  manual: number;
  maintPlan: number;
  total: number;
  closed: number;
  open: number;
  noEq: number;
  noBom: number;
  rate: number;
}

export interface ParsedSheetInfo {
  name: string;
  rows2D: unknown[][];
  headerRowIndex: number;
  colIdx: Record<string, number>;
  matchedNames: Record<string, string>;
}

export type UnmappedCodesMap = Record<string, number>;

export type SortColumn =
  | 'department'
  | 'manual'
  | 'maintPlan'
  | 'total'
  | 'closed'
  | 'open'
  | 'noEq'
  | 'noBom'
  | 'rate';

export type SortDirection = 'asc' | 'desc';

export type DrillFilterType = 'all' | 'closed' | 'open' | 'noEq' | 'noBom';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface PersistedUploadPayload {
  fileName: string;
  currentSheetName: string;
  uploadedAt: string;
  matchedColumns: Record<string, string>;
  rawRecords: MORecord[];
}
