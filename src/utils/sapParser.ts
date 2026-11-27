import * as XLSX from 'xlsx';
import type { MORecord, ParsedSheetInfo } from '../types/sap.ts';

export const COLUMN_ALIASES: Record<string, string[]> = {
  functionalLoc: ['functional loc.', 'functional loc', 'functional location'],
  plannerGroup: ['planner group', 'planner grp', 'planner grp.'],
  systemStatus: ['system status'],
  order: ['order', 'order number'],
  createdOn: ['created on'],
  orderType: ['order type'],
  description: ['description', 'short text'],
  equipment: ['equipment'],
  assembly: ['assembly'],
  maintenancePlan: ['maintenanceplan', 'maintenance plan', 'maintplan', 'maint.plan', 'maint. plan'],
};

function normalizeHeader(val: unknown): string {
  return String(val ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function detectHeaderRow(rows2D: unknown[][]): Omit<ParsedSheetInfo, 'name' | 'rows2D'> | null {
  const limit = Math.min(rows2D.length, 10);
  for (let r = 0; r < limit; r++) {
    const row = rows2D[r] || [];
    const normalizedCells = row.map(normalizeHeader);
    const hasFL = normalizedCells.some((c) => COLUMN_ALIASES.functionalLoc.includes(c));
    const hasSys = normalizedCells.some((c) => COLUMN_ALIASES.systemStatus.includes(c));
    const hasPG = normalizedCells.some((c) => COLUMN_ALIASES.plannerGroup.includes(c));
    const hasOrder = normalizedCells.some((c) => COLUMN_ALIASES.order.includes(c));

    if (hasFL && hasSys && (hasPG || hasOrder)) {
      const colIdx: Record<string, number> = {};
      const matchedNames: Record<string, string> = {};
      row.forEach((rawHeader, idx) => {
        const norm = normalizeHeader(rawHeader);
        if (!norm) return;
        for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
          if (colIdx[key] === undefined && aliases.includes(norm)) {
            colIdx[key] = idx;
            matchedNames[key] = String(rawHeader).trim();
          }
        }
      });
      return { headerRowIndex: r, colIdx, matchedNames };
    }
  }
  return null;
}

function formatCellDate(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return String(val).trim();
}

export function parseSapWorkbookBytes(data: Uint8Array): ParsedSheetInfo[] {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const validSheets: ParsedSheetInfo[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows2D = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const detected = detectHeaderRow(rows2D);
    if (detected) {
      validSheets.push({ name: sheetName, rows2D, ...detected });
    }
  }

  return validSheets;
}

export function extractSheetRecordsFromInfo(sheetInfo: ParsedSheetInfo): MORecord[] {
  const { rows2D, headerRowIndex, colIdx } = sheetInfo;
  const records: MORecord[] = [];

  for (let i = headerRowIndex + 1; i < rows2D.length; i++) {
    const row = rows2D[i];
    if (!row || row.length === 0) continue;

    const flRaw = colIdx.functionalLoc !== undefined ? String(row[colIdx.functionalLoc] ?? '').trim() : '';
    const pgRaw = colIdx.plannerGroup !== undefined ? String(row[colIdx.plannerGroup] ?? '').trim() : '';
    const sysRaw = colIdx.systemStatus !== undefined ? String(row[colIdx.systemStatus] ?? '').trim() : '';
    const eqRaw = colIdx.equipment !== undefined ? String(row[colIdx.equipment] ?? '').trim() : '';
    const asmRaw = colIdx.assembly !== undefined ? String(row[colIdx.assembly] ?? '').trim() : '';
    const mpRaw = colIdx.maintenancePlan !== undefined ? String(row[colIdx.maintenancePlan] ?? '').trim() : '';
    const orderRaw = colIdx.order !== undefined ? String(row[colIdx.order] ?? '').trim() : '';

    if (!flRaw && !sysRaw && !orderRaw) continue;

    // Exact SAP-PM Logic: FL = MID(FL, 5, 2) => substring(4, 6)
    const flCode = flRaw.substring(4, 6).toUpperCase();
    const pgCode = pgRaw.toUpperCase();
    const combinedCode = flCode + pgCode;

    // Exact Closed Status Rule
    const sysUpper = sysRaw.toUpperCase();
    const sys4 = sysUpper.substring(0, 4);
    const isClosed =
      sys4 === 'TECO' ||
      sys4 === 'CLSD' ||
      sysUpper.startsWith('INPR CAN') ||
      sysUpper.startsWith('TECO CAN');

    const isMaintPlan = mpRaw !== '';
    const noEq = !flRaw || !eqRaw;
    const noBom = !flRaw || !asmRaw;

    records.push({
      functionalLoc: flRaw,
      plannerGroup: pgRaw,
      code: combinedCode,
      systemStatus: sysRaw,
      equipment: eqRaw,
      assembly: asmRaw,
      maintenancePlan: mpRaw,
      isClosed,
      isMaintPlan,
      noEq,
      noBom,
      order: orderRaw,
      orderType: colIdx.orderType !== undefined ? String(row[colIdx.orderType] ?? '').trim() : '',
      description: colIdx.description !== undefined ? String(row[colIdx.description] ?? '').trim() : '',
      createdOn: colIdx.createdOn !== undefined ? formatCellDate(row[colIdx.createdOn]) : '',
    });
  }

  return records;
}
