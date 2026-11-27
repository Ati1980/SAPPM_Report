import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  ClipboardList,
  Download,
  FilePlus2,
  Layers,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Table2,
  TrendingUp,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_CODE_MAPPING,
  THEME_KEY,
} from './constants/sapData';
import type {
  DeptSummaryRow,
  MORecord,
  ParsedSheetInfo,
  SortColumn,
  SortDirection,
  ToastItem,
} from './types/sap';
import {
  computeDashboardData,
  exportDepartmentToExcel,
  exportSummaryToExcel,
  extractSheetRecords,
  getRateBadgeClass,
  getThaiTimestamp,
  loadSavedCodeMapping,
  loadUploadedDataFromDB,
  parseSapExcelFile,
  safeStorageGet,
  safeStorageSet,
  saveCodeMappingToStorage,
  saveUploadedDataToDB,
} from './utils/sapEngine';
import { TactileButton } from './components/TactileButton';
import { ClosureChart } from './components/ClosureChart';
import { PinModal } from './components/PinModal';
import { DrillDownModal } from './components/DrillDownModal';
import { MappingModal } from './components/MappingModal';
import { MobileDeptCards } from './components/MobileDeptCards';
import { MobileBottomNav, type MobileNavSection } from './components/MobileBottomNav';

export default function App() {
  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => safeStorageGet(THEME_KEY) === 'dark');

  // Clock
  const [clockText, setClockText] = useState<string>(() => getThaiTimestamp());

  // Admin & Modals
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [drillDeptName, setDrillDeptName] = useState<string | null>(null);

  // Dataset State
  const [isDemo, setIsDemo] = useState(true);
  const [validSheets, setValidSheets] = useState<ParsedSheetInfo[]>([]);
  const [currentSheetName, setCurrentSheetName] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploadedAt, setUploadedAt] = useState('');
  const [rawRecords, setRawRecords] = useState<MORecord[]>([]);
  const [matchedColumns, setMatchedColumns] = useState<Record<string, string>>({});
  const [codeMapping, setCodeMapping] = useState<Record<string, string>>(() => loadSavedCodeMapping());

  // Upload & Drag state
  const [isUploading, setIsUploading] = useState(false);
  const [isGlobalDrag, setIsGlobalDrag] = useState(false);
  const [isDropZoneHover, setIsDropZoneHover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter, Sort & Mobile Navigation
  const [onlyPrimary17, setOnlyPrimary17] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortColumn>('rate');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [mobileDeptView, setMobileDeptView] = useState<'cards' | 'table'>('cards');
  const [mobileActiveSection, setMobileActiveSection] = useState<MobileNavSection>('overview');
  const [refreshRotation, setRefreshRotation] = useState(0);

  // Section refs for smooth mobile bottom-nav scrolling
  const overviewRef = useRef<HTMLElement | null>(null);
  const deptSectionRef = useRef<HTMLDivElement | null>(null);
  const chartSectionRef = useRef<HTMLDivElement | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  // Sync theme class + mobile browser status bar theme-color meta
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    safeStorageSet(THEME_KEY, isDark ? 'dark' : 'light');

    const meta = document.getElementById('theme-color-meta');
    if (meta) {
      meta.setAttribute('content', isDark ? '#070d19' : '#f4f7fb');
    }
  }, [isDark]);

  // Live Thai Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setClockText(getThaiTimestamp());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Restore saved Excel dataset from IndexedDB on mount
  useEffect(() => {
    let mounted = true;
    loadUploadedDataFromDB().then((saved) => {
      if (!mounted) return;
      if (saved && Array.isArray(saved.rawRecords) && saved.rawRecords.length > 0) {
        setIsDemo(false);
        setFileName(saved.fileName || 'Uploaded_Data.xlsx');
        setCurrentSheetName(saved.currentSheetName || '');
        setUploadedAt(saved.uploadedAt || '');
        setMatchedColumns(saved.matchedColumns || {});
        setRawRecords(saved.rawRecords);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Derived Dashboard Data
  const { summaryRows, totals, unmappedCodes, extraDeptRowsCount } = useMemo(
    () =>
      computeDashboardData({
        isDemo,
        rawRecords,
        codeMapping,
        onlyPrimary17,
        searchQuery,
        sortBy,
        sortDir,
      }),
    [isDemo, rawRecords, codeMapping, onlyPrimary17, searchQuery, sortBy, sortDir]
  );

  const activeDrillRow: DeptSummaryRow | null = useMemo(() => {
    if (!drillDeptName) return null;
    return summaryRows.find((r) => r.department === drillDeptName) || null;
  }, [drillDeptName, summaryRows]);

  const unmappedCount = Object.keys(unmappedCodes).length;

  // Load parsed sheet into state + IndexedDB
  const applySheet = useCallback(
    (sheet: ParsedSheetInfo, sourceFileName: string, timestamp: string) => {
      const records = extractSheetRecords(sheet);
      setCurrentSheetName(sheet.name);
      setMatchedColumns(sheet.matchedNames);
      setRawRecords(records);
      setIsDemo(false);

      void saveUploadedDataToDB({
        fileName: sourceFileName,
        currentSheetName: sheet.name,
        uploadedAt: timestamp,
        matchedColumns: sheet.matchedNames,
        rawRecords: records,
      });

      return records.length;
    },
    []
  );

  // Handle Excel / CSV upload
  const handleFile = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        showToast('รองรับเฉพาะไฟล์ .xlsx, .xls หรือ .csv เท่านั้น', 'error');
        return;
      }

      setIsUploading(true);
      showToast(`กำลังอ่านไฟล์ ${file.name}...`, 'info');

      try {
        const sheets = await parseSapExcelFile(file);
        if (sheets.length === 0) {
          showToast(
            'ไม่พบหัวคอลัมน์ SAP-PM (Functional Loc., System status, Planner Group / Order) ใน 10 แถวแรก',
            'error'
          );
          return;
        }

        const nowTs = getThaiTimestamp();
        setValidSheets(sheets);
        setFileName(file.name);
        setUploadedAt(nowTs);
        const count = applySheet(sheets[0], file.name, nowTs);
        showToast(`อัปโหลดสำเร็จ! ประมวลผลข้อมูล ${count.toLocaleString()} รายการ`, 'success');
      } catch (err) {
        console.error(err);
        showToast('ไม่สามารถอ่านไฟล์ Excel/CSV ได้ กรุณาตรวจสอบรูปแบบไฟล์', 'error');
      } finally {
        setIsUploading(false);
      }
    },
    [applySheet, showToast]
  );

  // Global Drag & Drop when Admin Mode is active
  useEffect(() => {
    if (!isAdmin) {
      setIsGlobalDrag(false);
      return;
    }

    let dragCounter = 0;
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      setIsGlobalDrag(true);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsGlobalDrag(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsGlobalDrag(false);
      if (e.dataTransfer?.files?.[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [isAdmin, handleFile]);

  // Actions
  const handleAdminSuccess = useCallback(() => {
    setIsAdmin(true);
    setIsPinModalOpen(false);
    showToast('เข้าสู่ระบบ Admin สำเร็จ', 'success');
  }, [showToast]);

  const handleAdminLogout = useCallback(() => {
    setIsAdmin(false);
    setIsMappingModalOpen(false);
    showToast('ออกจากระบบ Admin แล้ว', 'info');
  }, [showToast]);

  const handleRefresh = useCallback(() => {
    setRefreshRotation((r) => r + 360);
    setCodeMapping(loadSavedCodeMapping());
    setClockText(getThaiTimestamp());
    showToast('รีเฟรชข้อมูลเรียบร้อยแล้ว', 'success');
  }, [showToast]);

  const handleExportSummary = useCallback(() => {
    try {
      exportSummaryToExcel(summaryRows);
      showToast('ส่งออกไฟล์สรุป Excel (.xlsx) สำเร็จ', 'success');
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการส่งออกไฟล์', 'error');
    }
  }, [summaryRows, showToast]);

  const handleExportDept = useCallback(
    (deptName: string, records: MORecord[]) => {
      try {
        exportDepartmentToExcel(deptName, records);
        showToast(`ส่งออกข้อมูลแผนก ${deptName} สำเร็จ`, 'success');
      } catch (err) {
        console.error(err);
        showToast('เกิดข้อผิดพลาดในการส่งออกข้อมูลแผนก', 'error');
      }
    },
    [showToast]
  );

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (sortBy === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(col);
        setSortDir(col === 'department' ? 'asc' : 'desc');
      }
    },
    [sortBy]
  );

  const handleMobileNavigate = useCallback((section: MobileNavSection) => {
    setMobileActiveSection(section);
    const targetEl =
      section === 'overview'
        ? overviewRef.current
        : section === 'departments'
          ? deptSectionRef.current
          : chartSectionRef.current;

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // KPI derived values
  const manualPct = totals.total > 0 ? (totals.manual / totals.total) * 100 : 0;
  const planPct = totals.total > 0 ? (totals.maintPlan / totals.total) * 100 : 0;
  const openPct = totals.total > 0 ? (totals.open / totals.total) * 100 : 0;
  const ringCircumference = 2 * Math.PI * 32;
  const ringOffset = ringCircumference - (Math.min(totals.rate, 100) / 100) * ringCircumference;

  const coreMatchedCols = [
    { key: 'functionalLoc', label: 'Functional Loc.' },
    { key: 'plannerGroup', label: 'Planner Group' },
    { key: 'systemStatus', label: 'System status' },
    { key: 'order', label: 'Order' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'assembly', label: 'Assembly' },
    { key: 'maintenancePlan', label: 'MaintenancePlan' },
  ];

  const sortableHeaders: { key: SortColumn; label: string; align: 'left' | 'right'; bg?: string }[] = [
    { key: 'department', label: 'แผนก', align: 'left' },
    { key: 'manual', label: 'MO (Manual)', align: 'right' },
    { key: 'maintPlan', label: 'MO (Maint.Plan)', align: 'right' },
    { key: 'total', label: 'จำนวน MO2569', align: 'right' },
    { key: 'closed', label: 'ปิดงาน', align: 'right', bg: 'bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' },
    { key: 'open', label: 'ยังไม่ปิด MO', align: 'right', bg: 'bg-rose-50/70 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300' },
    { key: 'noEq', label: 'ไม่มี EQ', align: 'right', bg: 'bg-amber-50/70 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300' },
    { key: 'noBom', label: 'ไม่มี BOM', align: 'right', bg: 'bg-amber-50/70 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300' },
    { key: 'rate', label: '%ปิดงาน', align: 'right' },
  ];

  return (
    <div className="bg-mesh min-h-dvh text-slate-800 dark:text-slate-100">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {/* Full-Window Drag & Drop Overlay (Admin Mode) */}
      <AnimatePresence>
        {isGlobalDrag && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-md p-6 pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.94 }}
              className="border-4 border-dashed border-sky-400 bg-slate-900/85 rounded-3xl p-10 text-center max-w-md w-full shadow-2xl"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400">
                <Upload className="h-9 w-9" />
              </div>
              <h3 className="font-heading text-xl font-bold text-white">วางไฟล์ Excel / CSV ที่นี่</h3>
              <p className="text-sm text-slate-300 mt-1">
                ระบบจับคู่ชื่อหัวคอลัมน์ SAP-PM อัตโนมัติและแสดงกราฟทันที
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification Container (Safe above mobile bottom nav) */}
      <div className="fixed bottom-20 md:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const colorCls =
              t.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : t.type === 'error'
                  ? 'bg-rose-600 text-white border-rose-500'
                  : t.type === 'warning'
                    ? 'bg-amber-500 text-white border-amber-400'
                    : 'bg-slate-800 dark:bg-slate-700 text-white border-slate-700';
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-xl text-xs sm:text-sm font-medium ${colorCls}`}
              >
                <span className="flex-1">{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Main Container */}
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 lg:px-6 pt-3 sm:pt-5 pb-safe-nav md:pb-6 space-y-4 sm:space-y-5">
        {/* ==================== HEADER BAR ==================== */}
        <header className="glass-card rounded-3xl shadow-glass dark:shadow-glass-dark px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4">
          {/* Left: Logo, Title, Live Clock & Data Source Status */}
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
            <div className="shrink-0">
              <div className="h-12 sm:h-14 px-3 sm:px-4 rounded-2xl bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800 text-white shadow-lg shadow-blue-700/25 flex flex-col justify-center">
                <span className="font-heading text-base sm:text-xl font-extrabold tracking-tight leading-none">
                  SAP
                </span>
                <span className="font-heading text-[8.5px] sm:text-[10px] font-semibold tracking-widest text-sky-200 mt-0.5">
                  PM MODULE
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <h1 className="font-heading text-base sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-snug text-balance">
                รายงานการเปิด-ปิด MO ในระบบ{' '}
                <span className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 dark:from-sky-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent font-extrabold">
                  SAP-PM 2570
                </span>
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs sm:text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-blue-700 dark:text-sky-400">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span className="tabular-nums">{clockText}</span>
                </span>

                {!isDemo && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                      {`ไฟล์: ${fileName}${uploadedAt ? ` · ${uploadedAt}` : ''}`}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Action Controls (44px+ Mobile Touch Targets) */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
            <TactileButton
              variant="emerald"
              onClick={handleExportSummary}
              title="ส่งออกตารางสรุปเป็นไฟล์ Excel (.xlsx)"
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs sm:text-sm font-semibold shadow-md shadow-emerald-600/20 whitespace-nowrap"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>Export สรุป</span>
            </TactileButton>

            {/* Animated Theme Toggle */}
            <TactileButton
              variant="surface"
              onClick={() => setIsDark((d) => !d)}
              title="สลับโหมดสว่าง / โหมดมืด"
              aria-label="สลับโหมดสว่าง / โหมดมืด"
              className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/85 dark:bg-slate-800/85 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 border border-slate-200/80 dark:border-slate-700"
            >
              <motion.span
                key={isDark ? 'sun' : 'moon'}
                initial={{ rotate: -65, scale: 0.6, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                className="inline-flex"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.span>
            </TactileButton>

            {/* Admin Login Button OR Active Admin Status */}
            {!isAdmin ? (
              <TactileButton
                variant="surface"
                onClick={() => setIsPinModalOpen(true)}
                title="เข้าสู่ระบบ Admin"
                aria-label="เข้าสู่ระบบ Admin"
                className="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-white/85 dark:bg-slate-800/85 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-300 border border-slate-200/80 dark:border-slate-700 font-heading text-xs font-semibold gap-1.5"
              >
                <Lock className="h-4 w-4 shrink-0" />
                <span className="sm:hidden">Admin</span>
              </TactileButton>
            ) : (
              <div className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-2xl bg-emerald-50/95 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/35">
                <span className="inline-flex items-center gap-1.5 font-heading text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Admin
                </span>
                <TactileButton
                  variant="rose"
                  sheen={false}
                  onClick={handleAdminLogout}
                  title="ออกจากระบบ Admin"
                  aria-label="ออกจากระบบ Admin"
                  className="min-h-[36px] min-w-[36px] rounded-xl bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </TactileButton>
              </div>
            )}
          </div>
        </header>

        {/* ==================== ADMIN CONTROL PANEL ==================== */}
        <AnimatePresence>
          {isAdmin && (
            <motion.section
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            >
              <div className="glass-card rounded-3xl border-2 border-indigo-200/80 dark:border-indigo-500/35 shadow-glass dark:shadow-glass-dark p-4 sm:p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 text-white font-heading text-xs font-semibold shadow-sm">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Admin Mode
                    </span>
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                      อัปโหลดไฟล์ Excel/CSV และตั้งค่า Code แผนก
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <TactileButton
                      variant="primary"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-heading text-xs sm:text-sm font-semibold shadow-md shadow-sky-600/20 whitespace-nowrap"
                    >
                      <Upload className="h-4 w-4 shrink-0" />
                      <span>อัปโหลดไฟล์</span>
                    </TactileButton>

                    <TactileButton
                      variant="surface"
                      onClick={() => setIsMappingModalOpen(true)}
                      className="relative inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-heading text-xs sm:text-sm font-semibold whitespace-nowrap"
                    >
                      <Settings className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                      <span>ตั้งค่า Code แผนก</span>
                      {unmappedCount > 0 && (
                        <span className="-top-1.5 -right-1.5 absolute min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow">
                          {unmappedCount}
                        </span>
                      )}
                    </TactileButton>

                    <TactileButton
                      variant="surface"
                      onClick={handleRefresh}
                      title="รีเฟรชและคำนวณข้อมูลใหม่ตามการตั้งค่าล่าสุด"
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-2xl bg-sky-50/90 dark:bg-sky-500/15 hover:bg-sky-100 dark:hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 font-heading text-xs sm:text-sm font-semibold whitespace-nowrap"
                    >
                      <motion.span
                        animate={{ rotate: refreshRotation }}
                        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                        className="inline-flex"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </motion.span>
                      <span>Refresh</span>
                    </TactileButton>

                    <TactileButton
                      variant="rose"
                      onClick={handleAdminLogout}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-heading text-xs sm:text-sm font-semibold shadow-md shadow-rose-600/20 whitespace-nowrap"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      <span>ออกจากระบบ</span>
                    </TactileButton>
                  </div>
                </div>

                {/* Tactile Drop Zone */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDropZoneHover(true);
                  }}
                  onDragLeave={() => setIsDropZoneHover(false)}
                  onDrop={() => setIsDropZoneHover(false)}
                  className={`w-full text-left rounded-2xl border-2 border-dashed p-4 sm:p-5 transition cursor-pointer group ${
                    isDropZoneHover
                      ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-500/15'
                      : 'border-sky-300 dark:border-sky-500/40 hover:border-sky-500 dark:hover:border-sky-400 bg-white/70 dark:bg-slate-900/55'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-3.5 text-center sm:text-left">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 group-hover:scale-105 transition">
                        {isUploading ? (
                          <RefreshCw className="h-6 w-6 animate-spin" />
                        ) : (
                          <FilePlus2 className="h-6 w-6" />
                        )}
                      </div>
                      <div>
                        <h2 className="font-heading text-sm sm:text-base font-semibold text-slate-800 dark:text-white">
                          แตะเพื่อเลือกไฟล์ หรือลากไฟล์ Excel / CSV มาวางที่นี่
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                          รองรับ <span className="font-semibold text-slate-700 dark:text-slate-200">.xlsx, .xls, .csv</span> — คอลัมน์สลับตำแหน่งได้ ระบบจับคู่ตามชื่อหัวคอลัมน์ SAP-PM อัตโนมัติ
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 px-4 py-2.5 rounded-xl bg-sky-600/10 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-heading text-xs sm:text-sm font-semibold group-hover:bg-sky-600 group-hover:text-white transition">
                      เลือกไฟล์จากเครื่อง
                    </span>
                  </div>
                </motion.button>

                {/* Loaded File & Matched Columns Bar */}
                {!isDemo && (
                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                      <span className="inline-flex items-center gap-1.5 font-heading font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{fileName}</span>
                      </span>
                      {validSheets.length > 1 && (
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-slate-500 dark:text-slate-400">ชีต:</span>
                          <select
                            value={currentSheetName}
                            onChange={(e) => {
                              const target = validSheets.find((s) => s.name === e.target.value);
                              if (target) {
                                applySheet(target, fileName, uploadedAt);
                                showToast(`เปลี่ยนเป็นชีต "${target.name}" แล้ว`, 'info');
                              }
                            }}
                            className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-base sm:text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          >
                            {validSheets.map((s) => (
                              <option key={s.name} value={s.name}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <span className="text-slate-500 dark:text-slate-400 font-medium tabular-nums">
                        ({rawRecords.length.toLocaleString()} รายการ)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {coreMatchedCols.map((c) => {
                        const matched = Boolean(matchedColumns[c.key]);
                        return (
                          <span
                            key={c.key}
                            className={`font-medium ${
                              matched
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {matched ? `✓ ${c.label}` : `- ${c.label}`}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ==================== 5 EXECUTIVE KPI CARDS ==================== */}
        <section ref={overviewRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 scroll-mt-4">
          {/* Card 1: Manual & Maint.Plan Split */}
          <div className="glass-card rounded-3xl p-4 sm:p-5 shadow-glass dark:shadow-glass-dark hover:-translate-y-0.5 transition duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="font-heading text-xs font-semibold text-slate-500 dark:text-slate-400">
                ประเภทการเปิด MO
              </span>
              <div className="h-8 w-8 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 my-1">
              <div className="rounded-2xl bg-sky-50/90 dark:bg-sky-500/10 p-2.5">
                <div className="text-[11px] font-medium text-sky-700 dark:text-sky-300">MO (Manual)</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  {totals.manual.toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl bg-violet-50/90 dark:bg-violet-500/10 p-2.5">
                <div className="text-[11px] font-medium text-violet-700 dark:text-violet-300">MO (Maint.Plan)</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  {totals.maintPlan.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="mt-2.5">
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-700"
                  style={{ width: `${manualPct.toFixed(1)}%` }}
                />
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-700"
                  style={{ width: `${planPct.toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium tabular-nums">
                <span>Manual {manualPct.toFixed(1)}%</span>
                <span>Plan {planPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Card 2: Total MO 2569 */}
          <div className="glass-card rounded-3xl p-4 sm:p-5 shadow-glass dark:shadow-glass-dark hover:-translate-y-0.5 transition duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-heading text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                จำนวน MO 2569
              </span>
              <div className="h-9 w-9 rounded-2xl bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                <ClipboardList className="h-5 w-5" />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight tabular-nums">
                {totals.total.toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                ใบสั่งซ่อมทั้งหมดในขอบเขตรายงาน
              </p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-sky-100 dark:bg-sky-900/40 overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-sky-500 to-blue-600 rounded-full" />
            </div>
          </div>

          {/* Card 3: Closed MO */}
          <div className="glass-card rounded-3xl p-4 sm:p-5 shadow-glass dark:shadow-glass-dark hover:-translate-y-0.5 transition duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-heading text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                ปิดงาน
              </span>
              <div className="h-9 w-9 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl sm:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">
                {totals.closed.toLocaleString()}
              </div>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1 font-medium">
                สถานะ TECO / CLSD / CAN
              </p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-emerald-100 dark:bg-emerald-900/40 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
                style={{ width: `${totals.rate.toFixed(2)}%` }}
              />
            </div>
          </div>

          {/* Card 4: Open MO */}
          <div className="glass-card rounded-3xl p-4 sm:p-5 shadow-glass dark:shadow-glass-dark hover:-translate-y-0.5 transition duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-heading text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">
                ยังไม่ปิด MO
              </span>
              <div className="h-9 w-9 rounded-2xl bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl sm:text-4xl font-extrabold text-rose-600 dark:text-rose-400 tracking-tight tabular-nums">
                {totals.open.toLocaleString()}
              </div>
              <p className="text-xs text-rose-600/80 dark:text-rose-300/80 mt-1 font-medium tabular-nums">
                คิดเป็น {openPct.toFixed(2)}% ของทั้งหมด
              </p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-rose-100 dark:bg-rose-900/40 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-amber-400 rounded-full transition-all duration-700"
                style={{ width: `${openPct.toFixed(2)}%` }}
              />
            </div>
          </div>

          {/* Card 5: % ปิด MO 69 with Circular Ring */}
          <div className="sm:col-span-2 lg:col-span-1 rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white shadow-xl shadow-emerald-600/25 hover:-translate-y-0.5 transition duration-200 flex items-center justify-between gap-3 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 h-28 w-28 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="z-10">
              <span className="font-heading text-xs font-semibold text-emerald-100">% ปิด MO 69</span>
              <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 tabular-nums">
                {totals.rate.toFixed(2)}%
              </div>
              <div className="mt-2 text-xs font-medium text-emerald-100">
                เป้าหมาย 90%
              </div>
            </div>
            <div className="relative h-20 w-20 shrink-0 z-10">
              <svg className="h-20 w-20" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="7" />
                <circle
                  className="progress-ring-circle"
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference.toFixed(2)}
                  strokeDashoffset={ringOffset.toFixed(2)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        </section>

        {/* ==================== FILTER & SEARCH BAR ==================== */}
        <section className="glass-card rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={onlyPrimary17}
                  onChange={(e) => setOnlyPrimary17(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600" />
              </div>
              <span className="font-heading text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
                แสดงเฉพาะ 17 แผนกหลัก
              </span>
            </label>

            {!isDemo && (unmappedCount > 0 || (onlyPrimary17 && extraDeptRowsCount > 0)) && (
              <TactileButton
                variant="rose"
                sheen={false}
                onClick={() => (isAdmin ? setIsMappingModalOpen(true) : setIsPinModalOpen(true))}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1 rounded-xl text-xs font-medium bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-200 dark:hover:bg-rose-500/30"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {[
                    unmappedCount > 0 ? `พบ ${unmappedCount} Code ยังไม่จับคู่` : '',
                    onlyPrimary17 && extraDeptRowsCount > 0
                      ? `ซ่อนนอก 17 แผนก ${extraDeptRowsCount.toLocaleString()} รายการ`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </TactileButton>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อแผนก..."
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl bg-white/85 dark:bg-slate-800/85 border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            />
          </div>
        </section>

        {/* ==================== MAIN 2-COLUMN WORKSPACE ==================== */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* LEFT: Department Summary (7 cols) */}
          <div
            ref={deptSectionRef}
            className="xl:col-span-7 glass-card rounded-3xl shadow-glass dark:shadow-glass-dark overflow-hidden scroll-mt-4"
          >
            <div className="px-4 sm:px-5 py-4 border-b border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <h2 className="font-heading text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Table2 className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>ตารางสรุปการเปิด-ปิด MO แยกตามแผนก</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="hidden md:inline">คลิกหัวคอลัมน์เพื่อเรียงลำดับ · </span>
                  แตะที่แผนกเพื่อดูรายละเอียด (Drill-Down)
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Mobile Cards / Full Table Switcher (< md) */}
                <div className="md:hidden inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                  <TactileButton
                    variant="ghost"
                    sheen={false}
                    pulseRing={false}
                    onClick={() => setMobileDeptView('cards')}
                    className={`relative min-h-[36px] px-3 py-1 rounded-lg text-xs font-heading font-semibold ${
                      mobileDeptView === 'cards' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {mobileDeptView === 'cards' && (
                      <motion.span
                        layoutId="mobileViewPill"
                        transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                        className="absolute inset-0 rounded-lg bg-white dark:bg-slate-700 shadow-sm -z-10"
                      />
                    )}
                    การ์ด
                  </TactileButton>
                  <TactileButton
                    variant="ghost"
                    sheen={false}
                    pulseRing={false}
                    onClick={() => setMobileDeptView('table')}
                    className={`relative min-h-[36px] px-3 py-1 rounded-lg text-xs font-heading font-semibold ${
                      mobileDeptView === 'table' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {mobileDeptView === 'table' && (
                      <motion.span
                        layoutId="mobileViewPill"
                        transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                        className="absolute inset-0 rounded-lg bg-white dark:bg-slate-700 shadow-sm -z-10"
                      />
                    )}
                    ตารางเต็ม
                  </TactileButton>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] font-medium text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-800" />0–19%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />20–49%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" />50–69%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />70–79%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" />80–84%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" />85–89%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />90–94%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-700" />≥95%</span>
                </div>
              </div>
            </div>

            {/* Mobile Card View (< md & mobileDeptView === 'cards') */}
            <div className={mobileDeptView === 'cards' ? 'md:hidden' : 'hidden'}>
              <MobileDeptCards rows={summaryRows} onSelectDept={(dept) => setDrillDeptName(dept)} />
              <div className="px-4 py-3 bg-slate-100/90 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs font-heading font-bold">
                <span>รวมทั้งหมด ({summaryRows.length} แผนก) · {totals.total.toLocaleString()} MO</span>
                <span className={`px-2.5 py-1 rounded-xl text-xs font-bold tabular-nums ${getRateBadgeClass(totals.rate)}`}>
                  {totals.rate.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Full 10-Column Sortable Table (always on md:+, or on mobile when 'table' selected) */}
            <div className={`${mobileDeptView === 'cards' ? 'hidden md:block' : 'block'} overflow-x-auto md:overflow-x-visible`}>
              <table className="w-full text-left border-collapse whitespace-nowrap md:whitespace-normal">
                <thead>
                  <tr className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-heading text-[11px] leading-tight border-b border-slate-200 dark:border-slate-700 select-none">
                    <th className="py-2.5 pl-3 pr-1 text-center w-8">#</th>
                    {sortableHeaders.map((h) => {
                      const active = sortBy === h.key;
                      const isLast = h.key === 'rate';
                      return (
                        <th
                          key={h.key}
                          onClick={() => handleSort(h.key)}
                          className={`py-2.5 ${isLast ? 'pl-1.5 pr-3' : 'px-1.5 xl:px-2'} cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition align-bottom ${
                            h.align === 'right' ? 'text-right' : 'text-left'
                          } ${h.bg || ''}`}
                        >
                          <div
                            className={`inline-flex items-center gap-0.5 ${
                              h.align === 'right' ? 'justify-end' : ''
                            }`}
                          >
                            <span>{h.label}</span>
                            <span className={active ? 'text-sky-600 dark:text-sky-400 font-bold shrink-0' : 'opacity-35 shrink-0'}>
                              {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-700/50 text-xs">
                  {summaryRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400">
                        ไม่พบข้อมูลแผนกที่ตรงกับเงื่อนไขการค้นหา
                      </td>
                    </tr>
                  ) : (
                    summaryRows.map((r, idx) => {
                      const noEqClass =
                        r.noEq > 0
                          ? 'font-bold text-orange-600 dark:text-orange-400 bg-amber-100/70 dark:bg-amber-500/15'
                          : 'text-slate-400 dark:text-slate-500 bg-amber-50/40 dark:bg-amber-500/5';
                      const noBomClass =
                        r.noBom > 0
                          ? 'font-bold text-rose-600 dark:text-rose-400 bg-amber-100/70 dark:bg-amber-500/15'
                          : 'text-slate-400 dark:text-slate-500 bg-amber-50/40 dark:bg-amber-500/5';

                      return (
                        <tr
                          key={r.department}
                          onClick={() => setDrillDeptName(r.department)}
                          className="hover:bg-sky-50/75 dark:hover:bg-sky-500/10 active:bg-sky-100/70 dark:active:bg-sky-500/20 transition cursor-pointer group"
                        >
                          <td className="py-2.5 pl-3 pr-1 text-center text-slate-400 dark:text-slate-500 font-medium tabular-nums whitespace-nowrap">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-1.5 xl:px-2 font-heading font-medium text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">
                            <div className="flex items-center gap-0.5 min-w-0">
                              <span className="truncate max-w-[132px] xl:max-w-none" title={r.department}>
                                {r.department}
                              </span>
                              <ChevronRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition text-sky-500 hidden xl:inline" />
                            </div>
                          </td>
                          <td className="py-2.5 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {r.manual.toLocaleString()}
                          </td>
                          <td
                            className={`py-2.5 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap ${
                              r.maintPlan > 0
                                ? 'font-semibold text-violet-700 dark:text-violet-300'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {r.maintPlan.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap font-bold text-slate-900 dark:text-white">
                            {r.total.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap font-semibold bg-emerald-50/50 dark:bg-emerald-500/5 text-emerald-700 dark:text-emerald-300">
                            {r.closed.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap font-semibold bg-rose-50/50 dark:bg-rose-500/5 text-rose-700 dark:text-rose-300">
                            {r.open.toLocaleString()}
                          </td>
                          <td className={`py-2.5 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap ${noEqClass}`}>
                            {r.noEq.toLocaleString()}
                          </td>
                          <td className={`py-2.5 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap ${noBomClass}`}>
                            {r.noBom.toLocaleString()}
                          </td>
                          <td className="py-2.5 pl-1.5 pr-3 text-right whitespace-nowrap">
                            <span
                              className={`inline-block min-w-[60px] text-center px-2 py-1 rounded-xl text-[11px] font-bold tabular-nums ${getRateBadgeClass(r.rate)}`}
                            >
                              {r.rate.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-100/95 dark:bg-slate-800/95 font-heading font-bold text-xs border-t-2 border-slate-300 dark:border-slate-600">
                  <tr className="text-slate-900 dark:text-white">
                    <td className="py-3 pl-3 pr-1 text-center">-</td>
                    <td className="py-3 px-1.5 xl:px-2">รวมทั้งหมด ({summaryRows.length} แผนก)</td>
                    <td className="py-3 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap">{totals.manual.toLocaleString()}</td>
                    <td className="py-3 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap text-violet-700 dark:text-violet-300">
                      {totals.maintPlan.toLocaleString()}
                    </td>
                    <td className="py-3 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap">{totals.total.toLocaleString()}</td>
                    <td className="py-3 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap bg-emerald-100/70 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                      {totals.closed.toLocaleString()}
                    </td>
                    <td className="py-3 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap bg-rose-100/70 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300">
                      {totals.open.toLocaleString()}
                    </td>
                    <td className="py-3 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap bg-amber-100/70 dark:bg-amber-500/15 text-orange-700 dark:text-orange-300">
                      {totals.noEq.toLocaleString()}
                    </td>
                    <td className="py-3 px-1.5 xl:px-2 text-right tabular-nums whitespace-nowrap bg-amber-100/70 dark:bg-amber-500/15 text-rose-700 dark:text-rose-300">
                      {totals.noBom.toLocaleString()}
                    </td>
                    <td className="py-3 pl-1.5 pr-3 text-right whitespace-nowrap">
                      <span
                        className={`inline-block min-w-[60px] text-center px-2 py-1 rounded-xl text-[11px] font-bold tabular-nums ${getRateBadgeClass(totals.rate)}`}
                      >
                        {totals.rate.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* RIGHT: Horizontal Bar Chart (5 cols) */}
          <div
            ref={chartSectionRef}
            className="xl:col-span-5 glass-card rounded-3xl shadow-glass dark:shadow-glass-dark p-4 sm:p-5 flex flex-col scroll-mt-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="font-heading text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>% ปิดงานแยกตามแผนก</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  แตะที่แท่งกราฟเพื่อดูรายละเอียดของแผนกนั้น
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] font-medium text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-800" />0–19%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />20–49%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" />50–69%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />70–79%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" />80–84%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" />85–89%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />90–94%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-700" />≥95%</span>
              </div>
            </div>

            <ClosureChart
              rows={summaryRows}
              isDark={isDark}
              onSelectDept={(dept) => setDrillDeptName(dept)}
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-400 dark:text-slate-500 pt-2 pb-2">
          SAP-PM Maintenance Order Executive Dashboard
        </footer>
      </div>

      {/* Mobile Bottom Navigation Bar (iOS & Android Thumb-Zone Ergonomics) */}
      <MobileBottomNav
        activeSection={mobileActiveSection}
        onNavigate={handleMobileNavigate}
        onExport={handleExportSummary}
      />

      {/* Modals / Mobile Bottom Sheets */}
      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handleAdminSuccess}
      />

      <DrillDownModal
        deptRow={activeDrillRow}
        isDemo={isDemo}
        isAdmin={isAdmin}
        onClose={() => setDrillDeptName(null)}
        onExportDept={handleExportDept}
        onRequestAdmin={() => setIsPinModalOpen(true)}
      />

      <MappingModal
        isOpen={isMappingModalOpen}
        codeMapping={codeMapping}
        unmappedCodes={unmappedCodes}
        onClose={() => setIsMappingModalOpen(false)}
        onSaveEntry={(code, dept) => {
          const updated = { ...codeMapping, [code]: dept };
          setCodeMapping(updated);
          saveCodeMappingToStorage(updated);
          showToast(`บันทึกการจับคู่ ${code} → ${dept} เรียบร้อย`, 'success');
        }}
        onDeleteEntry={(code) => {
          const updated = { ...codeMapping };
          delete updated[code];
          setCodeMapping(updated);
          saveCodeMappingToStorage(updated);
          showToast(`ลบการจับคู่ ${code} แล้ว`, 'info');
        }}
        onResetDefaults={() => {
          const reset = { ...DEFAULT_CODE_MAPPING };
          setCodeMapping(reset);
          saveCodeMappingToStorage(reset);
          showToast('คืนค่าเริ่มต้น 92 Code เรียบร้อยแล้ว', 'info');
        }}
      />
    </div>
  );
}
