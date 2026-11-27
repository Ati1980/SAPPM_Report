import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'motion/react';

interface RippleWave {
  id: number;
  x: number;
  y: number;
  size: number;
}

export function triggerMicroHaptic(ms = 8): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    // No-op on iOS Safari or restricted contexts
  }
}

export function useTactileRipple() {
  const [ripples, setRipples] = useState<RippleWave[]>([]);
  const [burstKey, setBurstKey] = useState(0);
  const nextId = useRef(1);

  const spawnRipple = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.15;
    const x = e.clientX ? e.clientX - rect.left : rect.width / 2;
    const y = e.clientY ? e.clientY - rect.top : rect.height / 2;
    const id = nextId.current++;

    setRipples((prev) => [...prev.slice(-3), { id, x, y, size }]);
    setBurstKey((k) => k + 1);
    triggerMicroHaptic(8);

    setTimeout(() => {
      setRipples((prev) => prev.filter((item) => item.id !== id));
    }, 560);
  }, []);

  return { ripples, burstKey, spawnRipple };
}

export interface TactileButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  variant?: 'primary' | 'emerald' | 'indigo' | 'rose' | 'ghost' | 'surface' | 'keypad';
  rippleColor?: string;
  sheen?: boolean;
  pulseRing?: boolean;
  children: React.ReactNode;
}

export const TactileButton: React.FC<TactileButtonProps> = ({
  variant = 'surface',
  rippleColor,
  sheen = true,
  pulseRing = true,
  className = '',
  onPointerDown,
  onClick,
  disabled,
  type = 'button',
  children,
  ...rest
}) => {
  const { ripples, burstKey, spawnRipple } = useTactileRipple();

  const defaultRippleColor =
    rippleColor ||
    (variant === 'surface' || variant === 'ghost' || variant === 'keypad'
      ? 'bg-sky-500/25 dark:bg-sky-400/30'
      : 'bg-white/40');

  const ringColor =
    variant === 'emerald'
      ? 'ring-emerald-400/60'
      : variant === 'rose'
        ? 'ring-rose-400/60'
        : variant === 'indigo'
          ? 'ring-indigo-400/60'
          : 'ring-sky-400/60';

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!disabled) {
      spawnRipple(e);
    }
    onPointerDown?.(e);
  };

  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1.5, scale: 1.015 }}
      whileTap={disabled ? undefined : { scale: 0.93 }}
      transition={{ type: 'spring', stiffness: 520, damping: 24, mass: 0.55 }}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      className={`relative overflow-hidden select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${sheen && !disabled ? 'btn-sheen-effect' : ''} ${className}`}
      {...rest}
    >
      {/* Expanding Pulse Shockwave Ring */}
      {pulseRing && burstKey > 0 && !disabled && (
        <span
          key={burstKey}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ${ringColor} animate-pulse-ring`}
        />
      )}

      {/* Specular Diagonal Light Sweep */}
      {sheen && !disabled && (
        <span
          aria-hidden="true"
          className="btn-sheen-bar pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0"
        />
      )}

      {/* Pointer-Origin Radial Ripple Waves */}
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
          }}
          className={`pointer-events-none absolute rounded-full ${defaultRippleColor} animate-button-ripple`}
        />
      ))}

      {/* Button Content */}
      <span className="relative z-10 inline-flex items-center justify-center [gap:inherit] w-full h-full">
        {children}
      </span>
    </motion.button>
  );
};
