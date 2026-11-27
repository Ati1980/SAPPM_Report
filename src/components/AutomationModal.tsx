import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Cloud,
  Copy,
  Download,
  KeyRound,
  RefreshCw,
  Terminal,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import type { AdminStatusResponse } from '../types/sap';
import { TactileButton } from './TactileButton';

interface AutomationModalProps {
  isOpen: boolean;
  adminToken: string;
  isDemo: boolean;
  cloudFileName: string;
  cloudSyncSource: string;
  cloudUploadedAt: string;
  cloudRowCount: number;
  onClose: () => void;
  onClearCloudData: () => Promise<void>;
  onToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

type AutoTab = 'sap-script' | 'cloud-flow' | 'status';

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const AutomationModal: React.FC<AutomationModalProps> = ({
  isOpen,
  adminToken,
  isDemo,
  cloudFileName,
  cloudSyncSource,
  cloudUploadedAt,
  cloudRowCount,
  onClose,
  onClearCloudData,
  onToast,
}) => {
  const [activeTab, setActiveTab] = useState<AutoTab>('sap-script');
  const [status, setStatus] = useState<AdminStatusResponse | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Configurable SAP GUI Script parameters
  const [tcode, setTcode] = useState('IW38');
  const [variantName, setVariantName] = useState('MO_2570');
  const [exportDir, setExportDir] = useState('C:\\SAP_PM_Export');
  const [exportFile, setExportFile] = useState('SAP_PM_IW38.xlsx');

  const webhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/api/sap-sync';
    return `${window.location.origin}/api/sap-sync`;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/admin/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AdminStatusResponse | null) => {
        if (data) setStatus(data);
      })
      .catch(() => {
        // ignore
      });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      onToast('คัดลอกเรียบร้อยแล้ว', 'success');
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      onToast('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาเลือกข้อความแล้วคัดลอกเอง', 'warning');
    }
  };

  const handleGenerateKey = async () => {
    if (isGeneratingKey) return;
    setIsGeneratingKey(true);
    try {
      const res = await fetch('/api/admin/sync-key', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const data = (await res.json().catch(() => ({}))) as {
        syncKey?: string;
        syncKeyPreview?: string;
        error?: string;
      };
      if (res.ok && data.syncKey) {
        setGeneratedKey(data.syncKey);
        setStatus((prev) =>
          prev
            ? { ...prev, syncKeyConfigured: true, syncKeyPreview: data.syncKeyPreview || null }
            : prev
        );
        onToast('สร้าง Sync Key ใหม่เรียบร้อย! กรุณาคัดลอกหรือดาวน์โหลดสคริปต์เก็บไว้', 'success');
      } else {
        onToast(data.error || 'ไม่สามารถสร้าง Sync Key ได้', 'error');
      }
    } catch {
      onToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const keyForScripts = generatedKey || '<YOUR_SAP_SYNC_KEY>';
  const cleanDir = exportDir.replace(/\\+$/, '');
  const fullExportPath = `${cleanDir}\\${exportFile}`;

  // Option 1: SAP GUI Script (.vbs) for IW38 -> Export Excel -> Trigger Cloud Uploader
  const vbsScript = `' =========================================================================
' SAP-PM Auto Export & Cloud Sync Script (Option 1)
' T-Code: ${tcode} | Variant: ${variantName || '(None)'}
' =========================================================================
Option Explicit

Dim SapGuiAuto, application, connection, session
Dim fso, shell, psCommand

Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists("${cleanDir}") Then
  fso.CreateFolder("${cleanDir}")
End If

' Attach to active SAP Logon GUI session
Set SapGuiAuto = GetObject("SAPGUI")
Set application = SapGuiAuto.GetScriptingEngine
Set connection = application.Children(0)
Set session = connection.Children(0)

' Open T-Code ${tcode}
session.findById("wnd[0]/tbar[0]/okcd").text = "/n${tcode}"
session.findById("wnd[0]").sendVKey 0
${
  variantName.trim()
    ? `
' Load saved Variant "${variantName.trim()}"
session.findById("wnd[0]/tbar[1]/btn[17]").press
session.findById("wnd[1]/usr/txtV-LOW").text = "${variantName.trim()}"
session.findById("wnd[1]/usr/txtENAME-LOW").text = ""
session.findById("wnd[1]/tbar[0]/btn[8]").press`
    : `' (No Variant set — using default selection)`
}

' Execute report (F8)
session.findById("wnd[0]/tbar[1]/btn[8]").press

' Export ALV Grid to Spreadsheet (.xlsx)
session.findById("wnd[0]/mbar/menu[0]/menu[3]/menu[1]").select
On Error Resume Next
session.findById("wnd[1]/tbar[0]/btn[0]").press
On Error GoTo 0

session.findById("wnd[1]/usr/ctxtDY_PATH").text = "${cleanDir}"
session.findById("wnd[1]/usr/ctxtDY_FILENAME").text = "${exportFile}"
session.findById("wnd[1]/tbar[0]/btn[11]").press ' Replace existing file

' Close Excel popup if SAP auto-opens it, then push to Cloud
WScript.Sleep 3000
Set shell = CreateObject("WScript.Shell")
psCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""${cleanDir}\\upload_to_cloud.ps1"""
shell.Run psCommand, 0, True
`;

  // PowerShell Uploader (.ps1) — pushes exported Excel directly to Cloud /api/sap-sync
  const psScript = `# =========================================================================
# SAP-PM Cloud Sync Uploader (Windows PowerShell 5.1 / 7 Compatible)
# =========================================================================
$ErrorActionPreference = "Stop"

$FilePath   = "${fullExportPath}"
$WebhookUrl = "${webhookUrl}"
$SyncKey    = "${keyForScripts}"

if (-not (Test-Path $FilePath)) {
  Write-Error "ไม่พบไฟล์: $FilePath"
  exit 1
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Bytes = [System.IO.File]::ReadAllBytes($FilePath)
$Base64 = [Convert]::ToBase64String($Bytes)

$Payload = @{
  fileName   = [System.IO.Path]::GetFileName($FilePath)
  syncSource = "SAP GUI Auto-Sync (Task Scheduler)"
  fileBase64 = $Base64
} | ConvertTo-Json -Compress

$Headers = @{
  "x-sync-key"   = $SyncKey
  "Content-Type" = "application/json; charset=utf-8"
}

$Response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Headers $Headers -Body ([System.Text.Encoding]::UTF8.GetBytes($Payload))
Write-Host "Sync สำเร็จ: $($Response.count) รายการ ($($Response.uploadedAt))"
`;

  const schtasksCmd = `schtasks /create /tn "SAP_PM_2570_AutoSync" /tr "wscript.exe \\"${cleanDir}\\sap_export_and_sync.vbs\\"" /sc DAILY /st 08:00 /f`;

  const powerAutomateBody = JSON.stringify(
    {
      fileName: "@{triggerOutputs()?['headers']?['x-ms-file-name-encoded']}",
      syncSource: 'Power Automate Cloud',
      fileBase64: "@{base64(body('Get_file_content'))}",
    },
    null,
    2
  );

  const tabs: { id: AutoTab; label: string; icon: React.ReactNode }[] = [
    { id: 'sap-script', label: 'ข้อ 1: SAP GUI + Task Scheduler', icon: <Terminal className="h-3.5 w-3.5" /> },
    { id: 'cloud-flow', label: 'Automate Cloud (HTTP Sync)', icon: <Workflow className="h-3.5 w-3.5" /> },
    { id: 'status', label: 'สถานะ Cloud', icon: <Cloud className="h-3.5 w-3.5" /> },
  ];

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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/65 backdrop-blur-sm p-0 sm:p-6"
        >
          <motion.div
            initial={{ y: '100%', scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: '100%', scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden"
          >
            {/* Mobile Grab Handle */}
            <div className="sm:hidden pt-2.5 pb-1 bg-slate-50/80 dark:bg-slate-800/50 flex justify-center">
              <div className="w-11 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/50">
              <div className="min-w-0">
                <h3 className="font-heading text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Cloud className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span className="truncate">Auto-Sync จาก SAP-PM เข้า Cloud (ไม่ต้องใช้ Power Automate Desktop)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  เชื่อมต่อ SAP GUI Script หรือ Power Automate Cloud เพื่ออัปเดตข้อมูลให้ทั้งเว็บ iOS และ Android อัตโนมัติ
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

            {/* Webhook Endpoint & Sync Key Banner */}
            <div className="px-4 sm:px-6 py-3.5 bg-sky-50/80 dark:bg-sky-500/10 border-b border-sky-200/80 dark:border-sky-500/20 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-heading font-semibold text-sky-800 dark:text-sky-300">
                    Cloud Sync Webhook URL (POST)
                  </div>
                  <div className="font-mono text-xs text-slate-800 dark:text-slate-100 truncate mt-0.5">
                    {webhookUrl}
                  </div>
                  <div className="text-[11px] text-sky-700/80 dark:text-sky-300/80 mt-0.5">
                    หมายเหตุ: สำหรับ PowerShell / Power Automate Cloud จากภายนอก แนะนำให้กด Deploy แอปขึ้น Cloud Run ก่อนเพื่อใช้ URL จริงที่ไม่ติดหน้าล็อกอิน AI Studio
                  </div>
                </div>
                <TactileButton
                  variant="surface"
                  sheen={false}
                  onClick={() => void handleCopy('webhook', webhookUrl)}
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-xs font-heading font-semibold text-sky-700 dark:text-sky-300 shrink-0"
                >
                  {copiedId === 'webhook' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>คัดลอก URL</span>
                </TactileButton>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-sky-200/60 dark:border-sky-500/20">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-heading font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Header: x-sync-key</span>
                  </div>
                  <div className="font-mono text-xs text-slate-700 dark:text-slate-200 truncate mt-0.5">
                    {generatedKey
                      ? generatedKey
                      : status?.syncKeyConfigured
                        ? `ตั้งค่าแล้ว (${status.syncKeyPreview || 'Active'})`
                        : 'ยังไม่ได้สร้าง Sync Key (กดปุ่มเพื่อสร้างและฝังลงในสคริปต์)'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {generatedKey && (
                    <TactileButton
                      variant="emerald"
                      sheen={false}
                      onClick={() => void handleCopy('synckey', generatedKey)}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-heading font-semibold"
                    >
                      {copiedId === 'synckey' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>คัดลอก Key</span>
                    </TactileButton>
                  )}
                  {!status?.hasEnvSyncKey && (
                    <TactileButton
                      variant="primary"
                      disabled={isGeneratingKey}
                      onClick={() => void handleGenerateKey()}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-heading font-semibold"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingKey ? 'animate-spin' : ''}`} />
                      <span>{status?.syncKeyConfigured ? 'สร้าง Key ใหม่' : 'สร้าง Sync Key'}</span>
                    </TactileButton>
                  )}
                </div>
              </div>
            </div>

            {/* Animated Tabs */}
            <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
              {tabs.map((t) => {
                const active = activeTab === t.id;
                return (
                  <TactileButton
                    key={t.id}
                    variant="ghost"
                    sheen={false}
                    pulseRing={false}
                    onClick={() => setActiveTab(t.id)}
                    className={`relative min-h-[40px] px-3.5 py-1.5 rounded-xl font-heading text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                      active ? 'text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="autoSyncTabBg"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        className="absolute inset-0 rounded-xl bg-sky-600 shadow-sm -z-10"
                      />
                    )}
                    {t.icon}
                    <span>{t.label}</span>
                  </TactileButton>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto modal-scroll-contain p-4 sm:p-6 pb-safe space-y-4 text-xs sm:text-sm">
              {activeTab === 'sap-script' && (
                <div className="space-y-4">
                  {/* Script Parameters */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-heading font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        SAP T-Code
                      </label>
                      <input
                        type="text"
                        value={tcode}
                        onChange={(e) => setTcode(e.target.value.toUpperCase())}
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-base sm:text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-heading font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        ชื่อ Variant ใน SAP
                      </label>
                      <input
                        type="text"
                        value={variantName}
                        onChange={(e) => setVariantName(e.target.value)}
                        placeholder="เช่น MO_2570"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-base sm:text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-heading font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        โฟลเดอร์เก็บไฟล์บน PC
                      </label>
                      <input
                        type="text"
                        value={exportDir}
                        onChange={(e) => setExportDir(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-base sm:text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-heading font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        ชื่อไฟล์ Export
                      </label>
                      <input
                        type="text"
                        value={exportFile}
                        onChange={(e) => setExportFile(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-base sm:text-xs"
                      />
                    </div>
                  </div>

                  {/* Step 1 & 2 Download Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <TactileButton
                      variant="primary"
                      onClick={() => {
                        downloadTextFile('sap_export_and_sync.vbs', vbsScript);
                        onToast('ดาวน์โหลด sap_export_and_sync.vbs แล้ว', 'success');
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-heading text-xs font-semibold shadow-sm"
                    >
                      <Download className="h-4 w-4" />
                      <span>ดาวน์โหลด sap_export_and_sync.vbs</span>
                    </TactileButton>

                    <TactileButton
                      variant="emerald"
                      onClick={() => {
                        downloadTextFile('upload_to_cloud.ps1', psScript);
                        onToast('ดาวน์โหลด upload_to_cloud.ps1 แล้ว', 'success');
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs font-semibold shadow-sm"
                    >
                      <Download className="h-4 w-4" />
                      <span>ดาวน์โหลด upload_to_cloud.ps1</span>
                    </TactileButton>
                  </div>

                  {/* Windows Task Scheduler Command */}
                  <div className="rounded-2xl bg-slate-100/90 dark:bg-slate-800/75 p-3.5 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-heading text-xs font-bold text-slate-800 dark:text-slate-100">
                        คำสั่งตั้งเวลาอัตโนมัติใน Windows (รันทุกวัน 08:00 น.)
                      </span>
                      <TactileButton
                        variant="surface"
                        sheen={false}
                        onClick={() => void handleCopy('schtasks', schtasksCmd)}
                        className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[11px] font-semibold"
                      >
                        <Copy className="h-3 w-3" />
                        <span>คัดลอกคำสั่ง</span>
                      </TactileButton>
                    </div>
                    <pre className="font-mono text-[11px] text-slate-700 dark:text-slate-200 overflow-x-auto whitespace-pre-wrap break-all">
                      {schtasksCmd}
                    </pre>
                  </div>

                  {/* Script Previews */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-900 text-slate-100 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-sky-300">1. sap_export_and_sync.vbs</span>
                        <TactileButton
                          variant="ghost"
                          sheen={false}
                          onClick={() => void handleCopy('vbs', vbsScript)}
                          className="min-h-[32px] px-2 py-1 rounded-lg text-[11px] text-slate-300 hover:bg-slate-800"
                        >
                          คัดลอก
                        </TactileButton>
                      </div>
                      <pre className="font-mono text-[11px] leading-relaxed text-slate-300 max-h-56 overflow-auto">
                        {vbsScript}
                      </pre>
                    </div>

                    <div className="rounded-2xl bg-slate-900 text-slate-100 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-emerald-300">2. upload_to_cloud.ps1</span>
                        <TactileButton
                          variant="ghost"
                          sheen={false}
                          onClick={() => void handleCopy('ps1', psScript)}
                          className="min-h-[32px] px-2 py-1 rounded-lg text-[11px] text-slate-300 hover:bg-slate-800"
                        >
                          คัดลอก
                        </TactileButton>
                      </div>
                      <pre className="font-mono text-[11px] leading-relaxed text-slate-300 max-h-56 overflow-auto">
                        {psScript}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'cloud-flow' && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-indigo-50/80 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25 p-4 space-y-2">
                    <h4 className="font-heading text-sm font-bold text-indigo-900 dark:text-indigo-200">
                      ขั้นตอนเชื่อมต่อ Power Automate Cloud / n8n (ไม่ต้องเปิดเครื่อง PC ทิ้งไว้)
                    </h4>
                    <ol className="list-decimal list-inside space-y-1.5 text-xs sm:text-sm text-indigo-900/90 dark:text-indigo-200/90">
                      <li>ตั้งค่า <strong>SAP Background Job (SM36)</strong> ส่งไฟล์ Excel จาก `IW38` เข้า Email (Outlook 365) หรือ OneDrive/SharePoint</li>
                      <li>สร้าง Flow ใน <strong>Power Automate Cloud</strong> (Trigger: <em>When a new email arrives</em> หรือ <em>When a file is created</em>)</li>
                      <li>เพิ่ม Action <strong>HTTP</strong> (Method: <code className="font-mono font-semibold">POST</code>) ยิงมาที่ Webhook URL ด้านบน</li>
                      <li>ใส่ Header <code className="font-mono font-semibold">x-sync-key</code> และ Body JSON ด้านล่าง — ข้อมูลจะอัปเดตเข้าแดชบอร์ดทุกเครื่อง (Web / iOS / Android) ทันที</li>
                    </ol>
                  </div>

                  <div className="rounded-2xl bg-slate-900 text-slate-100 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-sky-300">
                        Power Automate Cloud · HTTP Action Body (JSON)
                      </span>
                      <TactileButton
                        variant="ghost"
                        sheen={false}
                        onClick={() => void handleCopy('pa-body', powerAutomateBody)}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] text-slate-300 hover:bg-slate-800"
                      >
                        คัดลอก JSON
                      </TactileButton>
                    </div>
                    <pre className="font-mono text-xs leading-relaxed text-emerald-300 overflow-x-auto">
                      {powerAutomateBody}
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'status' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-100/90 dark:bg-slate-800/70 p-4">
                      <div className="text-xs text-slate-500 dark:text-slate-400">สถานะข้อมูลบน Cloud</div>
                      <div className="font-heading text-base font-bold mt-1 text-slate-900 dark:text-white">
                        {isDemo ? 'ยังไม่มีข้อมูล Cloud Sync (แสดงข้อมูลมาตรฐาน 2570)' : `เชื่อมต่อแล้ว (${cloudRowCount.toLocaleString()} รายการ)`}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-100/90 dark:bg-slate-800/70 p-4">
                      <div className="text-xs text-slate-500 dark:text-slate-400">แหล่งที่มามาล่าสุด</div>
                      <div className="font-heading text-base font-bold mt-1 text-slate-900 dark:text-white truncate">
                        {isDemo ? '-' : `${cloudFileName} (${cloudSyncSource || 'Upload'})`}
                      </div>
                      {!isDemo && cloudUploadedAt && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          อัปเดตเมื่อ: {cloudUploadedAt}
                        </div>
                      )}
                    </div>
                  </div>

                  {!isDemo && (
                    <div className="flex justify-end">
                      <TactileButton
                        variant="rose"
                        onClick={() => void onClearCloudData()}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-heading text-xs font-semibold shadow-sm"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>ล้างข้อมูล Cloud Sync กลับสู่ค่าเริ่มต้น</span>
                      </TactileButton>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
