import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Delete, KeyRound, Lock, X } from 'lucide-react';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/sapEngine';
import { TactileButton } from './TactileButton';

const PIN_HASH_KEY = 'sap_pm_2570_admin_pin_record_v1';

interface StoredPinRecord {
  salt: string;
  hash: string;
}

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function generateSaltHex(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Salted(pin: string, salt: string): Promise<string> {
  const input = `${salt}:${pin}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback if Web Crypto subtle is unavailable in non-HTTPS test context
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

function loadStoredPinRecord(): StoredPinRecord | null {
  const raw = safeStorageGet(PIN_HASH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPinRecord>;
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string' && parsed.salt && parsed.hash) {
      return { salt: parsed.salt, hash: parsed.hash };
    }
    return null;
  } catch {
    return null;
  }
}

export const PinModal: React.FC<PinModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [pinBuffer, setPinBuffer] = useState('');
  const pinRef = useRef('');
  const submittingRef = useRef(false);
  const [pendingSetupPin, setPendingSetupPin] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isFirstRunSetup, setIsFirstRunSetup] = useState(false);
  const [shakeCount, setShakeCount] = useState(0);

  const updatePinBuffer = useCallback((next: string) => {
    pinRef.current = next;
    setPinBuffer(next);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePinBuffer('');
    setPendingSetupPin(null);
    setErrorMessage('');
    setIsVerified(false);
    submittingRef.current = false;
    setIsFirstRunSetup(!loadStoredPinRecord());
  }, [isOpen, updatePinBuffer]);

  const handleCompleteFourDigits = useCallback(
    async (completedPin: string) => {
      if (submittingRef.current) return;

      if (isFirstRunSetup) {
        if (pendingSetupPin === null) {
          setPendingSetupPin(completedPin);
          updatePinBuffer('');
          setErrorMessage('');
          return;
        }
        if (completedPin !== pendingSetupPin) {
          setPendingSetupPin(null);
          setErrorMessage('รหัส PIN ทั้งสองครั้งไม่ตรงกัน กรุณาตั้งใหม่อีกครั้ง');
          setShakeCount((c) => c + 1);
          setTimeout(() => {
            updatePinBuffer('');
          }, 350);
          return;
        }

        submittingRef.current = true;
        const salt = generateSaltHex();
        const hash = await sha256Salted(completedPin, salt);
        safeStorageSet(PIN_HASH_KEY, JSON.stringify({ salt, hash }));
        setIsVerified(true);
        setTimeout(() => {
          submittingRef.current = false;
          onSuccess();
        }, 180);
        return;
      }

      const stored = loadStoredPinRecord();
      if (!stored) {
        setIsFirstRunSetup(true);
        setPendingSetupPin(null);
        updatePinBuffer('');
        return;
      }

      submittingRef.current = true;
      const computed = await sha256Salted(completedPin, stored.salt);
      if (computed === stored.hash) {
        setIsVerified(true);
        setTimeout(() => {
          submittingRef.current = false;
          onSuccess();
        }, 180);
      } else {
        submittingRef.current = false;
        setErrorMessage('รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่');
        setShakeCount((c) => c + 1);
        setTimeout(() => {
          updatePinBuffer('');
        }, 350);
      }
    },
    [isFirstRunSetup, pendingSetupPin, onSuccess, updatePinBuffer]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (!isOpen || isVerified || submittingRef.current || pinRef.current.length >= 4) {
        return;
      }
      setErrorMessage('');
      const next = pinRef.current + digit;
      updatePinBuffer(next);
      if (next.length === 4) {
        setTimeout(() => {
          void handleCompleteFourDigits(next);
        }, 120);
      }
    },
    [isOpen, isVerified, updatePinBuffer, handleCompleteFourDigits]
  );

  const handleBackspace = useCallback(() => {
    if (!isOpen || isVerified || submittingRef.current || pinRef.current.length === 0) return;
    updatePinBuffer(pinRef.current.slice(0, -1));
  }, [isOpen, isVerified, updatePinBuffer]);

  const handleClear = useCallback(() => {
    if (!isOpen || isVerified || submittingRef.current) return;
    updatePinBuffer('');
    setErrorMessage('');
    if (isFirstRunSetup) {
      setPendingSetupPin(null);
    }
  }, [isOpen, isVerified, isFirstRunSetup, updatePinBuffer]);

  const handleResetPin = useCallback(() => {
    safeStorageRemove(PIN_HASH_KEY);
    setIsFirstRunSetup(true);
    setPendingSetupPin(null);
    updatePinBuffer('');
    setErrorMessage('');
  }, [updatePinBuffer]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter' && pinRef.current.length === 4) {
        e.preventDefault();
        void handleCompleteFourDigits(pinRef.current);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleDigit, handleBackspace, handleCompleteFourDigits, onClose]);

  const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const headingTitle = isFirstRunSetup
    ? pendingSetupPin
      ? 'ยืนยันรหัส PIN อีกครั้ง'
      : 'ตั้งค่า PIN ผู้ดูแลครั้งแรก'
    : 'เข้าสู่ระบบผู้ดูแล (Admin)';

  const headingSubtitle = isFirstRunSetup
    ? pendingSetupPin
      ? 'กรอกรหัส PIN 4 หลักเดิมซ้ำอีกครั้งเพื่อยืนยัน'
      : 'กำหนดรหัส PIN 4 หลักสำหรับปลดล็อกโหมดอัปโหลดไฟล์'
    : 'กรอกรหัส PIN 4 หลักเพื่ออัปโหลดไฟล์ Excel / CSV และตั้งค่าแผนก';

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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/65 backdrop-blur-md p-0 sm:p-4"
        >
          <motion.div
            initial={{ y: '100%', scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: '100%', scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="glass-card rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm p-6 pb-safe border-t sm:border border-white/70 dark:border-slate-700 relative"
          >
            {/* Mobile Sheet Grab Handle */}
            <div className="sm:hidden w-11 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mb-4" />

            <TactileButton
              onClick={onClose}
              variant="ghost"
              pulseRing={false}
              className="!absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="h-5 w-5" />
            </TactileButton>

            <div className="text-center mb-4">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 text-white shadow-lg shadow-indigo-600/30">
                {isFirstRunSetup ? <KeyRound className="h-7 w-7" /> : <Lock className="h-7 w-7" />}
              </div>
              <h3 className="font-heading text-xl font-bold text-slate-900 dark:text-white">
                {headingTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {headingSubtitle}
              </p>
            </div>

            {/* 4 Animated PIN Dots */}
            <motion.div
              key={shakeCount}
              animate={errorMessage ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
              transition={{ duration: 0.36 }}
              className="flex items-center justify-center gap-4 my-5"
            >
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < pinBuffer.length;
                return (
                  <motion.div
                    key={idx}
                    animate={{
                      scale: isVerified ? 1.2 : filled ? 1.18 : 1,
                    }}
                    transition={{ type: 'spring', stiffness: 550, damping: 22 }}
                    className={`h-4 w-4 rounded-full border-2 transition-colors duration-150 ${
                      isVerified
                        ? 'border-emerald-500 bg-emerald-500 shadow-sm shadow-emerald-500/50'
                        : filled
                          ? 'border-indigo-600 dark:border-sky-400 bg-indigo-600 dark:bg-sky-400 shadow-sm shadow-sky-500/40'
                          : 'border-slate-300 dark:border-slate-600 bg-transparent'
                    }`}
                  />
                );
              })}
            </motion.div>

            {/* Error Message */}
            <div
              className={`min-h-[20px] text-center text-xs font-heading font-semibold text-rose-500 dark:text-rose-400 mb-3 transition-opacity ${
                errorMessage ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {errorMessage || ' '}
            </div>

            {/* Tactile On-Screen Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[276px] mx-auto">
              {keypadDigits.map((d) => (
                <TactileButton
                  key={d}
                  variant="keypad"
                  onClick={() => handleDigit(d)}
                  className="min-h-[52px] rounded-2xl bg-white/90 dark:bg-slate-800/90 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 border border-slate-200 dark:border-slate-700 font-heading text-lg font-bold text-slate-800 dark:text-white shadow-sm"
                >
                  {d}
                </TactileButton>
              ))}

              <TactileButton
                variant="ghost"
                onClick={handleClear}
                className="min-h-[52px] rounded-2xl bg-slate-100 dark:bg-slate-800/70 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 font-heading text-xs font-semibold"
              >
                ล้าง
              </TactileButton>

              <TactileButton
                variant="keypad"
                onClick={() => handleDigit('0')}
                className="min-h-[52px] rounded-2xl bg-white/90 dark:bg-slate-800/90 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 border border-slate-200 dark:border-slate-700 font-heading text-lg font-bold text-slate-800 dark:text-white shadow-sm"
              >
                0
              </TactileButton>

              <TactileButton
                variant="ghost"
                onClick={handleBackspace}
                aria-label="ลบตัวเลข"
                className="min-h-[52px] rounded-2xl bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                <Delete className="h-5 w-5" />
              </TactileButton>
            </div>

            {!isFirstRunSetup && (
              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={handleResetPin}
                  className="text-[11px] text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 underline underline-offset-2 transition cursor-pointer"
                >
                  ตั้งรหัส PIN ใหม่บนเครื่องนี้
                </button>
              </div>
            )}

            <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-3 hidden sm:block">
              รองรับการพิมพ์ตัวเลขจากแป้นพิมพ์ (0–9, Backspace, Enter, Esc)
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
