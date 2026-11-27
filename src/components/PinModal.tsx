import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Delete, KeyRound, Lock, X } from 'lucide-react';
import { TactileButton } from './TactileButton';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, isFirstSetup: boolean) => void;
}

export const PinModal: React.FC<PinModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [pinBuffer, setPinBuffer] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFirstRunSetup, setIsFirstRunSetup] = useState(false);
  const [shakeCount, setShakeCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setPinBuffer('');
    setErrorMessage('');
    setIsVerified(false);
    setIsSubmitting(false);

    let active = true;
    fetch('/api/admin/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { pinConfigured?: boolean } | null) => {
        if (active && data) {
          setIsFirstRunSetup(!data.pinConfigured);
        }
      })
      .catch(() => {
        // Ignore network error, default to login mode
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  const verifyPin = useCallback(
    async (pin: string) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        const endpoint = isFirstRunSetup ? '/api/admin/setup' : '/api/admin/login';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };

        if (res.ok && data.token) {
          setIsVerified(true);
          const token = data.token;
          const wasSetup = isFirstRunSetup;
          setTimeout(() => {
            onSuccess(token, wasSetup);
          }, 180);
        } else {
          setErrorMessage(data.error || 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่');
          setShakeCount((c) => c + 1);
          setTimeout(() => {
            setPinBuffer('');
          }, 400);
        }
      } catch {
        setErrorMessage('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อตรวจสอบ PIN ได้');
        setShakeCount((c) => c + 1);
        setTimeout(() => {
          setPinBuffer('');
        }, 400);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isFirstRunSetup, isSubmitting, onSuccess]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (!isOpen || isVerified || isSubmitting || pinBuffer.length >= 4) return;
      setErrorMessage('');
      const next = pinBuffer + digit;
      setPinBuffer(next);
      if (next.length === 4) {
        setTimeout(() => {
          void verifyPin(next);
        }, 120);
      }
    },
    [isOpen, isVerified, isSubmitting, pinBuffer, verifyPin]
  );

  const handleBackspace = useCallback(() => {
    if (!isOpen || isVerified || isSubmitting || pinBuffer.length === 0) return;
    setPinBuffer((prev) => prev.slice(0, -1));
  }, [isOpen, isVerified, isSubmitting, pinBuffer.length]);

  const handleClear = useCallback(() => {
    if (!isOpen || isVerified || isSubmitting) return;
    setPinBuffer('');
    setErrorMessage('');
  }, [isOpen, isVerified, isSubmitting]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter' && pinBuffer.length === 4) {
        e.preventDefault();
        void verifyPin(pinBuffer);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, pinBuffer, handleDigit, handleBackspace, verifyPin, onClose]);

  const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

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
                {isFirstRunSetup ? 'ตั้งค่า PIN ผู้ดูแลครั้งแรก' : 'เข้าสู่ระบบผู้ดูแล (Admin)'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isFirstRunSetup
                  ? 'กำหนดรหัส PIN 4 หลักบนเซิร์ฟเวอร์เพื่อใช้งาน Admin & Cloud Sync'
                  : 'กรอกรหัส PIN 4 หลักเพื่ออัปโหลดไฟล์และตั้งค่า Auto-Sync'}
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
                  disabled={isSubmitting}
                  onClick={() => handleDigit(d)}
                  className="min-h-[52px] rounded-2xl bg-white/90 dark:bg-slate-800/90 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 border border-slate-200 dark:border-slate-700 font-heading text-lg font-bold text-slate-800 dark:text-white shadow-sm"
                >
                  {d}
                </TactileButton>
              ))}

              <TactileButton
                variant="ghost"
                disabled={isSubmitting}
                onClick={handleClear}
                className="min-h-[52px] rounded-2xl bg-slate-100 dark:bg-slate-800/70 hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 border border-slate-200 dark:border-slate-700 font-heading text-xs font-semibold"
              >
                ล้าง
              </TactileButton>

              <TactileButton
                variant="keypad"
                disabled={isSubmitting}
                onClick={() => handleDigit('0')}
                className="min-h-[52px] rounded-2xl bg-white/90 dark:bg-slate-800/90 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 border border-slate-200 dark:border-slate-700 font-heading text-lg font-bold text-slate-800 dark:text-white shadow-sm"
              >
                0
              </TactileButton>

              <TactileButton
                variant="ghost"
                disabled={isSubmitting}
                onClick={handleBackspace}
                aria-label="ลบตัวเลข"
                className="min-h-[52px] rounded-2xl bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              >
                <Delete className="h-5 w-5" />
              </TactileButton>
            </div>

            <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-4 hidden sm:block">
              รองรับการพิมพ์ตัวเลขจากแป้นพิมพ์ (0–9, Backspace, Enter, Esc)
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
