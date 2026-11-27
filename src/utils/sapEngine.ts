import * as XLSX from 'xlsx';
import {
  DEFAULT_CODE_MAPPING,
  DEMO_SUMMARY,
  IDB_KEY,
  IDB_NAME,
  IDB_STORE,
  MAPPING_KEY,
  PRIMARY_17_DEPTS,
} from '../constants/sapData';
import type {
  DashboardTotals,
  DeptSummaryRow,
  MORecord,
  ParsedSheetInfo,
  PersistedUploadPayload,
  SortColumn,
  SortDirection,
  UnmappedCodesMap,
} from '../types/sap';
import { extractSheetRecordsFromInfo, parseSapWorkbookBytes } from './sapParser';

export function safeStorageGet(key: string): string | null {
  try {
    const val = window.localStorage.getItem(key);
    if (val !== null) return val;
  } catch {
    // ignore SecurityError
  }
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function safeStorageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function openDashboardDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error || new Error('IDB open error'));
    } catch (err) {
      reject(err);
    }
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('IDB timeout')), ms)),
  ]);
}

export async function saveUploadedDataToDB(payload: PersistedUploadPayload): Promise<void> {
  try {
    const db = await withTimeout(openDashboardDB(), 1000);
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(payload, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject((e.target as IDBTransaction).error);
      }),
      1000
    );
    db.close();
  } catch {
    // Non-fatal: active in memory
  }
}

export async function loadUploadedDataFromDB(): Promise<PersistedUploadPayload | null> {
  try {
    const db = await withTimeout(openDashboardDB(), 1000);
    const result = await withTimeout(
      new Promise<PersistedUploadPayload | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve((req.result as PersistedUploadPayload) || null);
        req.onerror = (e) => reject((e.target as IDBRequest).error);
      }),
      1000
    );
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearUploadedDataFromDB(): Promise<void> {
  try {
    const db = await withTimeout(openDashboardDB(), 1000);
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject((e.target as IDBTransaction).error);
      }),
      1000
    );
    db.close();
  } catch {
    // Non-fatal
  }
}

export function loadSavedCodeMapping(): Record<string, string> {
  const saved = safeStorageGet(MAPPING_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Record<string, string>;
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed;
      }
    } catch {
      // fallback
    }
  }
  return { ...DEFAULT_CODE_MAPPING };
}

export function saveCodeMappingToStorage(mapping: Record<string, string>): void {
  safeStorageSet(MAPPING_KEY, JSON.stringify(mapping));
}

export function getThaiTimestamp(): string {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const now = new Date();
  const d = now.getDate();
  const m = months[now.getMonth()];
  const y = now.getFullYear() + 543;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${d} ${m} ${y} ${hh}:${mm}:${ss}`;
}

export async function parseSapExcelFile(file: File): Promise<ParsedSheetInfo[]> {
  const buffer = await file.arrayBuffer();
  return parseSapWorkbookBytes(new Uint8Array(buffer));
}

export function extractSheetRecords(sheetInfo: ParsedSheetInfo): MORecord[] {
  return extractSheetRecordsFromInfo(sheetInfo);
}

export function computeDashboardData(params: {
  isDemo: boolean;
  rawRecords: MORecord[];
  codeMapping: Record<string, string>;
  onlyPrimary17: boolean;
  searchQuery: string;
  sortBy: SortColumn;
  sortDir: SortDirection;
}): {
  summaryRows: DeptSummaryRow[];
  totals: DashboardTotals;
  unmappedCodes: UnmappedCodesMap;
  extraDeptRowsCount: number;
} {
  const { isDemo, rawRecords, codeMapping, onlyPrimary17, searchQuery, sortBy, sortDir } = params;

  let aggregated: DeptSummaryRow[] = [];
  const unmappedCodes: UnmappedCodesMap = {};
  let extraDeptRowsCount = 0;

  if (isDemo) {
    aggregated = DEMO_SUMMARY.map((d) => ({ ...d, records: [] }));
  } else {
    const deptMap = new Map<string, DeptSummaryRow>();

    if (onlyPrimary17) {
      PRIMARY_17_DEPTS.forEach((dept) => {
        deptMap.set(dept, {
          department: dept,
          manual: 0,
          maintPlan: 0,
          total: 0,
          closed: 0,
          open: 0,
          noEq: 0,
          noBom: 0,
          rate: 0,
          records: [],
        });
      });
    }

    for (const rec of rawRecords) {
      const mappedDept = codeMapping[rec.code];
      let deptName = mappedDept;
      if (!deptName) {
        const unmappedKey = rec.code || '(ว่าง)';
        unmappedCodes[unmappedKey] = (unmappedCodes[unmappedKey] || 0) + 1;
        deptName = `ยังไม่ระบุแผนก (${unmappedKey})`;
      }
      const recordWithDept: MORecord = { ...rec, department: deptName };

      const isPrimary = PRIMARY_17_DEPTS.includes(deptName);
      if (onlyPrimary17 && !isPrimary) {
        extraDeptRowsCount++;
        continue;
      }

      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, {
          department: deptName,
          manual: 0,
          maintPlan: 0,
          total: 0,
          closed: 0,
          open: 0,
          noEq: 0,
          noBom: 0,
          rate: 0,
          records: [],
        });
      }

      const bucket = deptMap.get(deptName)!;
      bucket.total++;
      if (recordWithDept.isMaintPlan) bucket.maintPlan++;
      if (recordWithDept.isClosed) bucket.closed++;
      else bucket.open++;
      if (recordWithDept.noEq) bucket.noEq++;
      if (recordWithDept.noBom) bucket.noBom++;
      bucket.records.push(recordWithDept);
    }

    aggregated = Array.from(deptMap.values()).map((b) => {
      b.manual = b.total - b.maintPlan;
      b.rate = b.total > 0 ? (b.closed / b.total) * 100 : 0;
      return b;
    });
  }

  const totals = aggregated.reduce<DashboardTotals>(
    (acc, r) => {
      acc.manual += r.manual;
      acc.maintPlan += r.maintPlan;
      acc.total += r.total;
      acc.closed += r.closed;
      acc.open += r.open;
      acc.noEq += r.noEq;
      acc.noBom += r.noBom;
      return acc;
    },
    { manual: 0, maintPlan: 0, total: 0, closed: 0, open: 0, noEq: 0, noBom: 0, rate: 0 }
  );
  totals.rate = totals.total > 0 ? (totals.closed / totals.total) * 100 : 0;

  let displayRows = aggregated;
  if (searchQuery.trim() !== '') {
    const q = searchQuery.trim().toLowerCase();
    displayRows = aggregated.filter((r) => r.department.toLowerCase().includes(q));
  }

  displayRows = [...displayRows].sort((a, b) => {
    const valA = a[sortBy];
    const valB = b[sortBy];
    let cmp = 0;
    if (typeof valA === 'string' && typeof valB === 'string') {
      cmp = sortDir === 'asc' ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
    } else if (typeof valA === 'number' && typeof valB === 'number') {
      cmp = sortDir === 'asc' ? valA - valB : valB - valA;
    }
    if (cmp === 0 && sortBy !== 'total') {
      return b.total - a.total;
    }
    return cmp;
  });

  return { summaryRows: displayRows, totals, unmappedCodes, extraDeptRowsCount };
}

export function exportSummaryToExcel(summaryRows: DeptSummaryRow[]): void {
  const rows = summaryRows.map((r, i) => ({
    ลำดับ: i + 1,
    แผนก: r.department,
    'MO (Manual)': r.manual,
    'MO (Maint.Plan)': r.maintPlan,
    'จำนวน MO2569': r.total,
    ปิดงาน: r.closed,
    'ยังไม่ปิด MO': r.open,
    'ไม่มี EQ': r.noEq,
    'ไม่มี BOM': r.noBom,
    '%ปิดงาน': Number(r.rate.toFixed(2)),
  }));
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `SAP_PM_MO_Summary_${dateStamp}.xlsx`;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'สรุป_MO_SAP_PM');
  XLSX.writeFile(wb, filename);
}

export function exportDepartmentToExcel(deptName: string, records: MORecord[]): void {
  const rows = records.map((r, i) => ({
    ลำดับ: i + 1,
    แผนก: r.department || deptName,
    Order: r.order,
    'Created On': r.createdOn,
    'Order Type': r.orderType,
    Description: r.description,
    'Functional Loc.': r.functionalLoc,
    'Planner Group': r.plannerGroup,
    Code: r.code,
    Equipment: r.equipment,
    Assembly: r.assembly,
    'System status': r.systemStatus,
    สถานะ: r.isClosed ? 'ปิดงาน' : 'ยังไม่ปิด MO',
    MaintenancePlan: r.maintenancePlan,
  }));
  const safeDept = deptName.replace(/[\\/:*?"<>|]/g, '_');
  const filename = `SAP_PM_${safeDept}.xlsx`;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MO_Detail');
  XLSX.writeFile(wb, filename);
}

export function getRateBadgeClass(rate: number): string {
  if (rate >= 95) return 'bg-blue-700 text-white shadow-sm shadow-blue-700/25';
  if (rate >= 90) return 'bg-sky-500 text-white shadow-sm shadow-sky-500/25';
  if (rate >= 85) return 'bg-green-600 text-white shadow-sm shadow-green-600/25';
  if (rate >= 80) return 'bg-green-400 text-slate-950 shadow-sm shadow-green-400/25';
  if (rate >= 70) return 'bg-amber-400 text-slate-950 shadow-sm shadow-amber-400/25';
  if (rate >= 50) return 'bg-orange-500 text-white shadow-sm shadow-orange-500/25';
  if (rate >= 20) return 'bg-red-500 text-white shadow-sm shadow-red-500/25';
  return 'bg-red-800 text-white shadow-sm shadow-red-800/25';
}

export function getBarColor(rate: number): string {
  if (rate >= 95) return '#1d4ed8';
  if (rate >= 90) return '#0ea5e9';
  if (rate >= 85) return '#16a34a';
  if (rate >= 80) return '#4ade80';
  if (rate >= 70) return '#fbbf24';
  if (rate >= 50) return '#f97316';
  if (rate >= 20) return '#ef4444';
  return '#991b1b';
}
