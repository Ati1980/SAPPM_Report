import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, Search, X } from 'lucide-react';
import type { DeptSummaryRow, DrillFilterType } from '../types/sap';
import { TactileButton } from './TactileButton';

interface DrillDownModalProps {
  deptRow: DeptSummaryRow | null;
  isDemo: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onExportDept: (deptName: string, records: DeptSummaryRow['records']) => void;
  onRequestAdmin: () => void;
}

export const DrillDownModal: React.FC<DrillDownModalProps> = ({
  deptRow,
  isDemo,
  isAdmin,
  onClose,
  onExportDept,
  onRequestAdmin,
}) => {
  const [filter, setFilter] = useState<DrillFilterType>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (deptRow) {
      setFilter('all');
      setSearch('');
    }
  }, [deptRow]);

  useEffect(() => {
    if (!deptRow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deptRow, onClose]);

  const filteredRecords = useMemo(() => {
    if (!deptRow) return [];
    let list = deptRow.records || [];
    if (filter === 'closed') list = list.filter((r) => r.isClosed);
    else if (filter === 'open') list = list.filter((r) => !r.isClosed);
    else if (filter === 'noEq') list = list.filter((r) => r.noEq);
    else if (filter === 'noBom') list = list.filter((r) => r.noBom);

    if (search.trim() !== '') {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.order.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.functionalLoc.toLowerCase().includes(q) ||
          r.equipment.toLowerCase().includes(q) ||
          r.systemStatus.toLowerCase().includes(q)
      );
    }
    return list;
  }, [deptRow, filter, search]);

  const maxShow = 500;
  const sliced = filteredRecords.slice(0, maxShow);

  const tabs: { id: DrillFilterType; label: string; count: number }[] = deptRow
    ? [
        { id: 'all', label: 'ทั้งหมด', count: deptRow.total },
        { id: 'closed', label: 'ปิดงาน', count: deptRow.closed },
        { id: 'open', label: 'ยังไม่ปิด MO', count: deptRow.open },
        { id: 'noEq', label: 'ไม่มี EQ', count: deptRow.noEq },
        { id: 'noBom', label: 'ไม่มี BOM', count: deptRow.noBom },
      ]
    : [];

  return (
    <AnimatePresence>
      {deptRow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-6"
        >
          <motion.div
            initial={{ y: '100%', scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: '100%', scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92dvh] flex flex-col overflow-hidden"
          >
            {/* Mobile Drag Handle */}
            <div className="sm:hidden pt-2.5 pb-1 bg-slate-50/80 dark:bg-slate-800/50 flex justify-center">
              <div className="w-11 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-heading font-semibold text-sky-600 dark:text-sky-400">
                    รายละเอียดแผนก
                  </span>
                  <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                  <h3 className="font-heading text-base sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                    {deptRow.department}
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  ทั้งหมด {deptRow.total.toLocaleString()} MO · ปิดงาน {deptRow.closed.toLocaleString()} ({deptRow.rate.toFixed(2)}%) · ยังไม่ปิด {deptRow.open.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isDemo && (
                  <TactileButton
                    variant="emerald"
                    onClick={() => onExportDept(deptRow.department, filteredRecords)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs font-semibold shadow-sm whitespace-nowrap"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Export Excel (เฉพาะแผนกนี้)</span>
                    <span className="sm:hidden">Export</span>
                  </TactileButton>
                )}
                <TactileButton
                  variant="ghost"
                  onClick={onClose}
                  aria-label="ปิด"
                  className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700"
                >
                  <X className="h-5 w-5" />
                </TactileButton>
              </div>
            </div>

            {isDemo ? (
              <div className="p-5 sm:p-6 pb-safe space-y-5 overflow-y-auto modal-scroll-contain">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-2xl p-3.5 bg-slate-100 dark:bg-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Manual / Maint.Plan</div>
                    <div className="text-base sm:text-lg font-bold tabular-nums mt-1 text-slate-900 dark:text-white">
                      {deptRow.manual.toLocaleString()} / {deptRow.maintPlan.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-2xl p-3.5 bg-emerald-50 dark:bg-emerald-500/15">
                    <div className="text-xs text-emerald-700 dark:text-emerald-300">ปิดงานแล้ว</div>
                    <div className="text-base sm:text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
                      {deptRow.closed.toLocaleString()} ({deptRow.rate.toFixed(2)}%)
                    </div>
                  </div>
                  <div className="rounded-2xl p-3.5 bg-rose-50 dark:bg-rose-500/15">
                    <div className="text-xs text-rose-700 dark:text-rose-300">ยังไม่ปิด MO</div>
                    <div className="text-base sm:text-lg font-bold tabular-nums text-rose-700 dark:text-rose-300 mt-1">
                      {deptRow.open.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-2xl p-3.5 bg-amber-50 dark:bg-amber-500/15">
                    <div className="text-xs text-amber-700 dark:text-amber-300">ไม่มี EQ / ไม่มี BOM</div>
                    <div className="text-base sm:text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300 mt-1">
                      {deptRow.noEq.toLocaleString()} / {deptRow.noBom.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-xs sm:text-sm text-sky-900 dark:text-sky-200">
                    <p className="font-heading font-semibold">กำลังแสดงข้อมูลตัวอย่าง (Demo 2569)</p>
                    <p className="text-sky-700 dark:text-sky-300/90 mt-0.5">
                      รายการใบงาน MO รายบรรทัดจะแสดงทันทีเมื่อเข้าสู่ระบบ Admin และอัปโหลดไฟล์ Excel จาก SAP-PM
                    </p>
                  </div>
                  {!isAdmin && (
                    <TactileButton
                      variant="primary"
                      onClick={() => {
                        onClose();
                        onRequestAdmin();
                      }}
                      className="shrink-0 w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-heading text-xs font-semibold shadow-sm"
                    >
                      เข้าสู่ระบบ Admin
                    </TactileButton>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Animated Filter Tabs & Search */}
                <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                    {tabs.map((t) => {
                      const active = filter === t.id;
                      return (
                        <TactileButton
                          key={t.id}
                          variant={active ? 'primary' : 'surface'}
                          pulseRing={false}
                          sheen={false}
                          onClick={() => setFilter(t.id)}
                          className={`relative min-h-[40px] px-3 py-1.5 rounded-xl font-heading text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                            active
                              ? 'text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="drillActiveTabBg"
                              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                              className="absolute inset-0 rounded-xl bg-sky-600 shadow-sm -z-10"
                            />
                          )}
                          <span>
                            {t.label}{' '}
                            <span className="ml-1 opacity-85 tabular-nums">({t.count.toLocaleString()})</span>
                          </span>
                        </TactileButton>
                      );
                    })}
                  </div>

                  <div className="relative w-full md:w-72">
                    <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="ค้นหา Order, Description, FL, EQ..."
                      className="w-full min-h-[42px] pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Desktop Table + Mobile Card List */}
                <div className="flex-1 overflow-auto modal-scroll-contain">
                  {/* Mobile Card List (< md) */}
                  <div className="md:hidden divide-y divide-slate-200/70 dark:divide-slate-800 p-3 space-y-2.5">
                    {sliced.length === 0 ? (
                      <div className="py-10 text-center text-slate-400 text-sm">
                        ไม่พบรายการใบงานในตัวกรองนี้
                      </div>
                    ) : (
                      sliced.map((r, i) => (
                        <div
                          key={`${r.order}-${i}`}
                          className="rounded-2xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 p-3.5 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400">
                              {r.order || '-'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                                r.isClosed
                                  ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                              }`}
                            >
                              {r.isClosed ? 'ปิดงาน' : 'ยังไม่ปิด'}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-2">
                            {r.description || '-'}
                          </p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <div>FL: <span className="font-mono text-slate-700 dark:text-slate-200">{r.functionalLoc || '-'}</span></div>
                            <div>Status: <span className="font-mono text-slate-700 dark:text-slate-200">{r.systemStatus || '-'}</span></div>
                            <div>EQ: <span className={`font-mono ${r.noEq ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-slate-700 dark:text-slate-200'}`}>{r.equipment || '(ไม่มี)'}</span></div>
                            <div>BOM: <span className={`font-mono ${r.noBom ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-700 dark:text-slate-200'}`}>{r.assembly || '(ไม่มี)'}</span></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Desktop Table (>= md) */}
                  <table className="hidden md:table w-full text-left border-collapse text-xs sm:text-sm">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-heading text-xs z-10 shadow-sm">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Order</th>
                        <th className="py-2.5 px-3">Created On</th>
                        <th className="py-2.5 px-3">Order Type</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Functional Loc.</th>
                        <th className="py-2.5 px-3">Equipment</th>
                        <th className="py-2.5 px-3">Assembly</th>
                        <th className="py-2.5 px-3">System status</th>
                        <th className="py-2.5 px-3">สถานะ</th>
                        <th className="py-2.5 px-3">Maint.Plan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                      {sliced.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-10 text-center text-slate-400">
                            ไม่พบรายการใบงานในตัวกรองนี้
                          </td>
                        </tr>
                      ) : (
                        sliced.map((r, i) => (
                          <tr key={`${r.order}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                            <td className="py-2 px-3 text-slate-400 tabular-nums">{i + 1}</td>
                            <td className="py-2 px-3 font-mono font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap">
                              {r.order || '-'}
                            </td>
                            <td className="py-2 px-3 text-xs whitespace-nowrap tabular-nums">{r.createdOn || '-'}</td>
                            <td className="py-2 px-3 whitespace-nowrap">{r.orderType || '-'}</td>
                            <td className="py-2 px-3 max-w-[260px] truncate" title={r.description}>
                              {r.description || '-'}
                            </td>
                            <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">{r.functionalLoc || '-'}</td>
                            <td className={`py-2 px-3 font-mono text-xs whitespace-nowrap ${r.noEq ? 'text-orange-600 dark:text-orange-400 font-semibold' : ''}`}>
                              {r.equipment || '(ไม่มี)'}
                            </td>
                            <td className={`py-2 px-3 font-mono text-xs whitespace-nowrap ${r.noBom ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                              {r.assembly || '(ไม่มี)'}
                            </td>
                            <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">{r.systemStatus || '-'}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-lg font-semibold text-[11px] ${
                                  r.isClosed
                                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                }`}
                              >
                                {r.isClosed ? 'ปิดงาน' : 'ยังไม่ปิด'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">{r.maintenancePlan || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="px-4 sm:px-5 py-2.5 pb-safe border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="tabular-nums">
                    {filteredRecords.length > maxShow
                      ? `แสดง ${maxShow.toLocaleString()} จาก ${filteredRecords.length.toLocaleString()} รายการ`
                      : `แสดง ${filteredRecords.length.toLocaleString()} รายการ`}
                  </span>
                  <span className="hidden sm:inline">แสดงสูงสุด 500 รายการบนหน้าจอ (Export Excel จะได้ครบทุกรายการ)</span>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
