import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import type { MORecord, PersistedUploadPayload } from './src/types/sap.ts';
import { extractSheetRecordsFromInfo, parseSapWorkbookBytes } from './src/utils/sapParser.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CLOUD_DATA_PATH = path.resolve(DATA_DIR, 'cloud_sap_data.json');
const AUTH_STORE_PATH = path.resolve(DATA_DIR, 'auth_store.json');

interface AuthStore {
  adminPinSalt?: string;
  adminPinHash?: string;
  syncKeyHash?: string;
  syncKeyPreview?: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function safeResolveInDataDir(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid storage path');
  }
  return resolved;
}

function readAuthStore(): AuthStore {
  try {
    const file = safeResolveInDataDir(AUTH_STORE_PATH);
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as AuthStore;
  } catch {
    return {};
  }
}

function writeAuthStore(store: AuthStore): void {
  ensureDataDir();
  const file = safeResolveInDataDir(AUTH_STORE_PATH);
  fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
}

function readCloudData(): PersistedUploadPayload | null {
  try {
    const file = safeResolveInDataDir(CLOUD_DATA_PATH);
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as PersistedUploadPayload;
    if (parsed && Array.isArray(parsed.rawRecords)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCloudData(payload: PersistedUploadPayload): void {
  ensureDataDir();
  const file = safeResolveInDataDir(CLOUD_DATA_PATH);
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
}

function clearCloudData(): void {
  try {
    const file = safeResolveInDataDir(CLOUD_DATA_PATH);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch {
    // ignore
  }
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function constantTimeEqualHex(aHex: string, bHex: string): boolean {
  const aBuf = Buffer.from(aHex, 'hex');
  const bBuf = Buffer.from(bHex, 'hex');
  if (aBuf.length === 0 || aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function hashPinWithSalt(pin: string, saltHex: string): string {
  return crypto.scryptSync(pin, saltHex, 64).toString('hex');
}

function signAdminToken(): string {
  const payload = {
    role: 'admin',
    exp: Date.now() + 12 * 60 * 60 * 1000,
    jti: crypto.randomBytes(8).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }
  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      role?: string;
      exp?: number;
    };
    return decoded.role === 'admin' && typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function extractBearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return undefined;
}

function verifySyncCredential(req: Request): boolean {
  const bearer = extractBearerToken(req);
  if (verifyAdminToken(bearer)) return true;

  const headerKey =
    (typeof req.headers['x-sync-key'] === 'string' ? req.headers['x-sync-key'].trim() : '') ||
    (bearer || '');
  if (!headerKey) return false;

  const envSyncKey = process.env.SAP_SYNC_KEY?.trim();
  if (envSyncKey) {
    return constantTimeEqualHex(sha256Hex(headerKey), sha256Hex(envSyncKey));
  }

  const authStore = readAuthStore();
  if (authStore.syncKeyHash) {
    return constantTimeEqualHex(sha256Hex(headerKey), authStore.syncKeyHash);
  }

  return false;
}

function formatThaiServerTimestamp(): string {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const now = new Date();
  const bangkok = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const d = bangkok.getDate();
  const m = months[bangkok.getMonth()];
  const y = bangkok.getFullYear() + 543;
  const hh = String(bangkok.getHours()).padStart(2, '0');
  const mm = String(bangkok.getMinutes()).padStart(2, '0');
  const ss = String(bangkok.getSeconds()).padStart(2, '0');
  return `${d} ${m} ${y} ${hh}:${mm}:${ss}`;
}

function sanitizeFileName(rawName: unknown): string {
  const base = path.basename(String(rawName || 'SAP_PM_Sync.xlsx')).replace(/[^\w.\-\u0E00-\u0E7F ]+/g, '_');
  return base.slice(0, 120) || 'SAP_PM_Sync.xlsx';
}

function validateRecordsArray(input: unknown): MORecord[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100000) return null;
  const cleaned: MORecord[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    cleaned.push({
      functionalLoc: String(r.functionalLoc ?? '').slice(0, 120),
      plannerGroup: String(r.plannerGroup ?? '').slice(0, 40),
      code: String(r.code ?? '').slice(0, 40),
      systemStatus: String(r.systemStatus ?? '').slice(0, 120),
      equipment: String(r.equipment ?? '').slice(0, 80),
      assembly: String(r.assembly ?? '').slice(0, 80),
      maintenancePlan: String(r.maintenancePlan ?? '').slice(0, 80),
      isClosed: Boolean(r.isClosed),
      isMaintPlan: Boolean(r.isMaintPlan),
      noEq: Boolean(r.noEq),
      noBom: Boolean(r.noBom),
      order: String(r.order ?? '').slice(0, 60),
      orderType: String(r.orderType ?? '').slice(0, 40),
      description: String(r.description ?? '').slice(0, 300),
      createdOn: String(r.createdOn ?? '').slice(0, 40),
    });
  }
  return cleaned.length > 0 ? cleaned : null;
}

let cachedCloudData: PersistedUploadPayload | null = readCloudData();

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '30mb' }));
  app.use(
    express.raw({
      type: [
        'application/octet-stream',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ],
      limit: '30mb',
    })
  );

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Public dashboard read: returns latest cloud-synced SAP-PM data (if any)
  app.get('/api/sap-data', (_req: Request, res: Response) => {
    if (!cachedCloudData) {
      res.json({ hasData: false, data: null });
      return;
    }
    res.json({ hasData: true, data: cachedCloudData });
  });

  // Admin status (non-sensitive booleans & masked preview only)
  app.get('/api/admin/status', (_req: Request, res: Response) => {
    const authStore = readAuthStore();
    const hasEnvPin = Boolean(process.env.ADMIN_PIN?.trim());
    const hasEnvSyncKey = Boolean(process.env.SAP_SYNC_KEY?.trim());
    res.json({
      pinConfigured: hasEnvPin || Boolean(authStore.adminPinHash && authStore.adminPinSalt),
      syncKeyConfigured: hasEnvSyncKey || Boolean(authStore.syncKeyHash),
      syncKeyPreview: hasEnvSyncKey ? 'Configured via Env Secret' : authStore.syncKeyPreview || null,
      hasEnvPin,
      hasEnvSyncKey,
    });
  });

  // First-run atomic Admin PIN setup (only available when ADMIN_PIN env is unset and no PIN hash exists)
  app.post('/api/admin/setup', (req: Request, res: Response) => {
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'กรุณากรอกรหัส PIN ตัวเลข 4 หลัก' });
      return;
    }

    const envPin = process.env.ADMIN_PIN?.trim();
    const authStore = readAuthStore();
    if (envPin || (authStore.adminPinHash && authStore.adminPinSalt)) {
      res.status(409).json({ error: 'รหัส PIN ผู้ดูแลถูกตั้งค่าไว้แล้ว' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPinWithSalt(pin, salt);
    writeAuthStore({
      ...authStore,
      adminPinSalt: salt,
      adminPinHash: hash,
    });

    res.json({ token: signAdminToken() });
  });

  // Admin PIN login
  app.post('/api/admin/login', (req: Request, res: Response) => {
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'รหัส PIN ต้องเป็นตัวเลข 4 หลัก' });
      return;
    }

    const envPin = process.env.ADMIN_PIN?.trim();
    if (envPin) {
      const ok = constantTimeEqualHex(sha256Hex(pin), sha256Hex(envPin));
      if (!ok) {
        res.status(401).json({ error: 'รหัส PIN ไม่ถูกต้อง' });
        return;
      }
      res.json({ token: signAdminToken() });
      return;
    }

    const authStore = readAuthStore();
    if (!authStore.adminPinHash || !authStore.adminPinSalt) {
      res.status(412).json({ error: 'ยังไม่ได้ตั้งรหัส PIN ผู้ดูแล' });
      return;
    }

    const computed = hashPinWithSalt(pin, authStore.adminPinSalt);
    if (!constantTimeEqualHex(computed, authStore.adminPinHash)) {
      res.status(401).json({ error: 'รหัส PIN ไม่ถูกต้อง' });
      return;
    }

    res.json({ token: signAdminToken() });
  });

  // Generate or rotate Sync Key for SAP GUI Script / Power Automate Cloud (Admin only)
  app.post('/api/admin/sync-key', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!verifyAdminToken(token)) {
      res.status(401).json({ error: 'ต้องเข้าสู่ระบบ Admin ก่อน' });
      return;
    }

    if (process.env.SAP_SYNC_KEY?.trim()) {
      res.status(409).json({ error: 'SAP_SYNC_KEY ถูกกำหนดผ่าน Environment Secret แล้ว' });
      return;
    }

    const rawKey = `sap_sync_${crypto.randomBytes(20).toString('hex')}`;
    const preview = `${rawKey.slice(0, 12)}••••${rawKey.slice(-4)}`;
    const authStore = readAuthStore();
    writeAuthStore({
      ...authStore,
      syncKeyHash: sha256Hex(rawKey),
      syncKeyPreview: preview,
    });

    res.json({ syncKey: rawKey, syncKeyPreview: preview });
  });

  // Cloud Sync Webhook: accepts Base64 Excel/CSV JSON, raw binary Excel/CSV, or pre-parsed records JSON
  app.post('/api/sap-sync', (req: Request, res: Response) => {
    if (!verifySyncCredential(req)) {
      res.status(401).json({ error: 'Sync Key หรือสิทธิ์ผู้ดูแลไม่ถูกต้อง' });
      return;
    }

    try {
      const nowThai = formatThaiServerTimestamp();
      const nowIso = new Date().toISOString();

      // Mode A: Raw binary Excel/CSV body (curl --data-binary / PowerShell -InFile)
      if (Buffer.isBuffer(req.body)) {
        const fileName = sanitizeFileName(req.headers['x-file-name'] || 'SAP_PM_AutoSync.xlsx');
        const syncSource = String(req.headers['x-sync-source'] || 'SAP GUI Auto-Sync').slice(0, 60);
        const sheets = parseSapWorkbookBytes(new Uint8Array(req.body));
        if (sheets.length === 0) {
          res.status(400).json({ error: 'ไม่พบหัวคอลัมน์ SAP-PM (Functional Loc., System status) ในไฟล์ที่ส่งมา' });
          return;
        }
        const first = sheets[0];
        const records = extractSheetRecordsFromInfo(first);
        const payload: PersistedUploadPayload = {
          fileName,
          currentSheetName: first.name,
          uploadedAt: nowThai,
          syncSource,
          updatedAtIso: nowIso,
          matchedColumns: first.matchedNames,
          rawRecords: records,
        };
        cachedCloudData = payload;
        writeCloudData(payload);
        res.json({ ok: true, count: records.length, fileName, uploadedAt: nowThai, syncSource });
        return;
      }

      // Mode B: JSON with Base64 Excel/CSV content (PowerShell & Power Automate Cloud HTTP Action)
      if (req.body && typeof req.body.fileBase64 === 'string') {
        const fileName = sanitizeFileName(req.body.fileName || 'SAP_PM_AutoSync.xlsx');
        const syncSource = String(req.body.syncSource || 'Automate Cloud Sync').slice(0, 60);
        const cleanedB64 = req.body.fileBase64.replace(/^data:[^;]+;base64,/, '').trim();
        const bytes = Buffer.from(cleanedB64, 'base64');
        if (bytes.length === 0) {
          res.status(400).json({ error: 'เนื้อหาไฟล์ Base64 ว่างเปล่าหรือไม่ถูกต้อง' });
          return;
        }
        const sheets = parseSapWorkbookBytes(new Uint8Array(bytes));
        if (sheets.length === 0) {
          res.status(400).json({ error: 'ไม่พบหัวคอลัมน์ SAP-PM (Functional Loc., System status) ในไฟล์ที่ส่งมา' });
          return;
        }
        const first = sheets[0];
        const records = extractSheetRecordsFromInfo(first);
        const payload: PersistedUploadPayload = {
          fileName,
          currentSheetName: first.name,
          uploadedAt: nowThai,
          syncSource,
          updatedAtIso: nowIso,
          matchedColumns: first.matchedNames,
          rawRecords: records,
        };
        cachedCloudData = payload;
        writeCloudData(payload);
        res.json({ ok: true, count: records.length, fileName, uploadedAt: nowThai, syncSource });
        return;
      }

      // Mode C: Pre-parsed records JSON (Browser Admin Upload -> Sync to Cloud)
      if (req.body && Array.isArray(req.body.rawRecords)) {
        const records = validateRecordsArray(req.body.rawRecords);
        if (!records) {
          res.status(400).json({ error: 'ข้อมูลรายการ MO ไม่ถูกต้อง' });
          return;
        }
        const fileName = sanitizeFileName(req.body.fileName || 'SAP_PM_Upload.xlsx');
        const syncSource = String(req.body.syncSource || 'Admin Browser Upload').slice(0, 60);
        const payload: PersistedUploadPayload = {
          fileName,
          currentSheetName: String(req.body.currentSheetName || 'Sheet1').slice(0, 80),
          uploadedAt: String(req.body.uploadedAt || nowThai).slice(0, 60),
          syncSource,
          updatedAtIso: nowIso,
          matchedColumns:
            req.body.matchedColumns && typeof req.body.matchedColumns === 'object'
              ? req.body.matchedColumns
              : {},
          rawRecords: records,
        };
        cachedCloudData = payload;
        writeCloudData(payload);
        res.json({ ok: true, count: records.length, fileName, uploadedAt: payload.uploadedAt, syncSource });
        return;
      }

      res.status(400).json({ error: 'รูปแบบข้อมูลไม่รองรับ กรุณาส่ง fileBase64, binary Excel/CSV หรือ rawRecords' });
    } catch (err) {
      console.error('SAP sync error:', err);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดระหว่างประมวลผลไฟล์ SAP-PM บนเซิร์ฟเวอร์' });
    }
  });

  // Admin: Clear cloud dataset back to default
  app.post('/api/sap-data/clear', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!verifyAdminToken(token)) {
      res.status(401).json({ error: 'ต้องเข้าสู่ระบบ Admin ก่อน' });
      return;
    }
    cachedCloudData = null;
    clearCloudData();
    res.json({ ok: true });
  });

  // Vite dev middleware or static dist serving
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SAP-PM 2570 Cloud Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
