import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { PRIMARY_17_DEPTS } from '../constants/sapData';
import type { UnmappedCodesMap } from '../types/sap';
import { TactileButton } from './TactileButton';

interface MappingModalProps {
  isOpen: boolean;
  codeMapping: Record<string, string>;
  unmappedCodes: UnmappedCodesMap;
  onClose: () => void;
  onSaveEntry: (code: string, dept: string) => void;
  onDeleteEntry: (code: string) => void;
  onResetDefaults: () => void;
}

export const MappingModal: React.FC<MappingModalProps> = ({
  isOpen,
  codeMapping,
  unmappedCodes,
  onClose,
  onSaveEntry,
  onDeleteEntry,
  onResetDefaults,
}) => {
  const [newCode, setNewCode] = useState('');
  const [newDept, setNewDept] = useState('');
  const [search, setSearch] = useState('');
  const deptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const allDeptSuggestions = useMemo(
    () => Array.from(new Set([...PRIMARY_17_DEPTS, ...Object.values(codeMapping)])),
    [codeMapping]
  );

  const unmappedEntries = useMemo(() => Object.entries(unmappedCodes), [unmappedCodes]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(codeMapping)
      .filter(([k, v]) => !q || k.toLowerCase().includes(q) || v.toLowerCase().includes(q))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [codeMapping, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCode.trim().toUpperCase();
    const dept = newDept.trim();
    if (!code || !dept) return;
    onSaveEntry(code, dept);
    setNewCode('');
    setNewDept('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden"
          >
            {/* Mobile Drag Handle */}
            <div className="sm:hidden pt-2.5 pb-1 bg-slate-50/80 dark:bg-slate-800/50 flex justify-center">
              <div className="w-11 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
              <div className="min-w-0 pr-2">
                <h3 className="font-heading text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  ตั้งค่า Code แผนก (FL + Planner Group)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  บันทึกอัตโนมัติในเบราว์เซอร์และคำนวณกราฟใหม่ทันที
                </p>
              </div>
              <TactileButton
                variant="ghost"
                onClick={onClose}
                aria-label="ปิด"
                className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 shrink-0"
              >
                <X className="h-5 w-5" />
              </TactileButton>
            </div>

            {/* Unmapped Quick-Fix Banner */}
            {unmappedEntries.length > 0 && (
              <div className="px-4 sm:px-5 py-3 bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200 dark:border-rose-500/20">
                <div className="text-xs font-heading font-semibold text-rose-700 dark:text-rose-300 mb-2">
                  พบ Code ที่ยังไม่ได้จับคู่แผนกในไฟล์ที่อัปโหลด (แตะเพื่อเพิ่มทันที):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {unmappedEntries.map(([code, cnt]) => (
                    <TactileButton
                      key={code}
                      variant="rose"
                      sheen={false}
                      onClick={() => {
                        setNewCode(code);
                        deptInputRef.current?.focus();
                      }}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-500/40 text-xs font-mono font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white"
                    >
                      {code} ({cnt})
                    </TactileButton>
                  ))}
                </div>
              </div>
            )}

            {/* Add / Edit Form (16px font on mobile prevents iOS Safari auto-zoom) */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Code เช่น WTWT"
                  required
                  className="sm:col-span-4 min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-mono uppercase text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  ref={deptInputRef}
                  type="text"
                  list="deptDatalist"
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                  placeholder="ชื่อแผนก เช่น ยานยนต์หนัก"
                  required
                  className="sm:col-span-5 min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <datalist id="deptDatalist">
                  {allDeptSuggestions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                <TactileButton
                  type="submit"
                  variant="primary"
                  className="sm:col-span-3 min-h-[44px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-heading text-xs sm:text-sm font-semibold shadow-sm whitespace-nowrap"
                >
                  + เพิ่ม / อัปเดต
                </TactileButton>
              </form>
            </div>

            {/* Search & Reset Bar */}
            <div className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา Code หรือ แผนก..."
                className="flex-1 min-w-[160px] max-w-xs min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium tabular-nums">
                  {Object.keys(codeMapping).length} รายการ
                </span>
                <TactileButton
                  variant="ghost"
                  sheen={false}
                  pulseRing={false}
                  onClick={onResetDefaults}
                  className="min-h-[38px] px-2.5 rounded-lg text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                >
                  คืนค่าเริ่มต้น (92 Code)
                </TactileButton>
              </div>
            </div>

            {/* Mapping Table */}
            <div className="flex-1 overflow-auto modal-scroll-contain p-3 sm:px-5 pb-safe">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 font-heading text-xs border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 px-2">Code (FL + PG)</th>
                    <th className="py-2 px-2">แผนก</th>
                    <th className="py-2 px-2 text-right w-28">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
                  {filteredEntries.map(([code, dept]) => (
                    <tr key={code} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="py-2 px-2 font-mono font-semibold text-sky-600 dark:text-sky-400">
                        {code}
                      </td>
                      <td className="py-2 px-2 text-slate-800 dark:text-slate-200">{dept}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <TactileButton
                            variant="ghost"
                            sheen={false}
                            pulseRing={false}
                            onClick={() => {
                              setNewCode(code);
                              setNewDept(dept);
                              deptInputRef.current?.focus();
                            }}
                            className="min-h-[36px] px-2 rounded-lg text-xs text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-500/15"
                          >
                            แก้ไข
                          </TactileButton>
                          <TactileButton
                            variant="ghost"
                            sheen={false}
                            pulseRing={false}
                            onClick={() => onDeleteEntry(code)}
                            className="min-h-[36px] px-2 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                          >
                            ลบ
                          </TactileButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
