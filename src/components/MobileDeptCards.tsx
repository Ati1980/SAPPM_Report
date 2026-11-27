import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import type { DeptSummaryRow } from '../types/sap';
import { getBarColor, getRateBadgeClass } from '../utils/sapEngine';
import { useTactileRipple } from './TactileButton';

interface MobileDeptCardsProps {
  rows: DeptSummaryRow[];
  onSelectDept: (deptName: string) => void;
}

const MobileDeptCardItem: React.FC<{
  row: DeptSummaryRow;
  index: number;
  onSelect: () => void;
}> = ({ row, index, onSelect }) => {
  const { ripples, spawnRipple } = useTactileRipple();

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      onPointerDown={spawnRipple}
      onClick={onSelect}
      className="relative overflow-hidden w-full text-left rounded-2xl bg-white/90 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/70 p-3.5 shadow-sm active:bg-sky-50/70 dark:active:bg-sky-500/10 cursor-pointer"
    >
      {/* Pointer-Origin Ripple */}
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
          className="pointer-events-none absolute rounded-full bg-sky-500/20 dark:bg-sky-400/25 animate-button-ripple"
        />
      ))}

      <div className="relative z-10 space-y-2.5">
        {/* Top Row: Rank + Dept Name + % Rate */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold tabular-nums shrink-0">
              {index + 1}
            </span>
            <span className="font-heading text-sm font-bold text-slate-900 dark:text-white truncate">
              {row.department}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`inline-block min-w-[64px] text-center px-2.5 py-1 rounded-xl text-xs font-bold tabular-nums ${getRateBadgeClass(row.rate)}`}
            >
              {row.rate.toFixed(2)}%
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        {/* Mini Progress Bar */}
        <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(row.rate, 100)}%`,
              backgroundColor: getBarColor(row.rate),
            }}
          />
        </div>

        {/* Bottom Stats Grid */}
        <div className="grid grid-cols-4 gap-1.5 text-[11px] pt-0.5">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 px-2 py-1.5">
            <div className="text-slate-400 dark:text-slate-500">ทั้งหมด</div>
            <div className="font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
              {row.total.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 px-2 py-1.5">
            <div className="text-emerald-700/80 dark:text-emerald-400">ปิดงาน</div>
            <div className="font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
              {row.closed.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-rose-50/70 dark:bg-rose-500/10 px-2 py-1.5">
            <div className="text-rose-700/80 dark:text-rose-400">ยังไม่ปิด</div>
            <div className="font-bold text-rose-700 dark:text-rose-300 tabular-nums mt-0.5">
              {row.open.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl bg-amber-50/70 dark:bg-amber-500/10 px-2 py-1.5">
            <div className="text-amber-700/80 dark:text-amber-400">EQ/BOM</div>
            <div className="font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-0.5">
              {row.noEq}/{row.noBom}
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
};

export const MobileDeptCards: React.FC<MobileDeptCardsProps> = ({ rows, onSelectDept }) => {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-slate-400 text-sm">
        ไม่พบข้อมูลแผนกที่ตรงกับเงื่อนไขการค้นหา
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-3">
      {rows.map((r, idx) => (
        <MobileDeptCardItem
          key={r.department}
          row={r}
          index={idx}
          onSelect={() => onSelectDept(r.department)}
        />
      ))}
    </div>
  );
};
