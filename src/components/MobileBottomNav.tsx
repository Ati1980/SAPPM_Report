import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, Download, LayoutDashboard, Table2 } from 'lucide-react';
import { TactileButton } from './TactileButton';

export type MobileNavSection = 'overview' | 'departments' | 'chart';

interface MobileBottomNavProps {
  activeSection: MobileNavSection;
  onNavigate: (section: MobileNavSection) => void;
  onExport: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeSection,
  onNavigate,
  onExport,
}) => {
  const items: { id: MobileNavSection; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'ภาพรวม', icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: 'departments', label: 'แผนก', icon: <Table2 className="h-5 w-5" /> },
    { id: 'chart', label: 'กราฟ', icon: <BarChart3 className="h-5 w-5" /> },
  ];

  return (
    <nav
      aria-label="เมนูหลักบนมือถือ"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/92 dark:bg-slate-900/92 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-4px_24px_rgba(15,23,42,0.08)]"
      style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="grid grid-cols-4 items-center px-2 pt-1.5">
        {items.map((item) => {
          const active = activeSection === item.id;
          return (
            <TactileButton
              key={item.id}
              variant="ghost"
              sheen={false}
              pulseRing={false}
              onClick={() => onNavigate(item.id)}
              className={`relative flex-col min-h-[48px] py-1 rounded-2xl transition-colors ${
                active
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="mobileNavActivePill"
                  transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                  className="absolute inset-x-2 inset-y-0.5 rounded-2xl bg-sky-50 dark:bg-sky-500/15 -z-10"
                />
              )}
              <div className="flex flex-col items-center justify-center gap-0.5">
                {item.icon}
                <span className="font-heading text-[10px] font-semibold tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            </TactileButton>
          );
        })}

        <TactileButton
          variant="ghost"
          sheen={false}
          pulseRing={false}
          onClick={onExport}
          className="flex-col min-h-[48px] py-1 rounded-2xl text-emerald-600 dark:text-emerald-400"
        >
          <div className="flex flex-col items-center justify-center gap-0.5">
            <Download className="h-5 w-5" />
            <span className="font-heading text-[10px] font-semibold tracking-tight whitespace-nowrap">
              Export
            </span>
          </div>
        </TactileButton>
      </div>
    </nav>
  );
};
