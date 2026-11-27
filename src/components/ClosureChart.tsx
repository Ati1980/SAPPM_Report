import React, { useEffect, useRef, useState } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
  type Plugin,
} from 'chart.js';
import type { DeptSummaryRow } from '../types/sap';
import { getBarColor } from '../utils/sapEngine';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

interface ClosureChartProps {
  rows: DeptSummaryRow[];
  isDark: boolean;
  onSelectDept: (deptName: string) => void;
}

export const ClosureChart: React.FC<ClosureChartProps> = ({ rows, isDark, onSelectDept }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'bar'> | null>(null);
  const rowsRef = useRef<DeptSummaryRow[]>(rows);
  const isDarkRef = useRef<boolean>(isDark);
  const onSelectDeptRef = useRef(onSelectDept);

  const [useFallback, setUseFallback] = useState(false);
  const [isCompactMobile, setIsCompactMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const isCompactRef = useRef<boolean>(isCompactMobile);

  rowsRef.current = rows;
  isDarkRef.current = isDark;
  isCompactRef.current = isCompactMobile;
  onSelectDeptRef.current = onSelectDept;

  useEffect(() => {
    const onResize = () => setIsCompactMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Create Chart.js instance once on mount (never destroyed on 1s clock ticks)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setUseFallback(true);
        return;
      }

      const initialRows = rowsRef.current;
      const compact = isCompactRef.current;
      const dark = isDarkRef.current;

      const sapChartOverlayPlugin: Plugin<'bar'> = {
        id: 'sapChartOverlay',
        afterDatasetsDraw(chart) {
          try {
            const {
              ctx: c,
              chartArea: { top, bottom },
              scales: { x },
            } = chart;
            if (!x) return;

            const darkNow = isDarkRef.current;
            const compactNow = isCompactRef.current;

            c.save();

            // 1. Vertical dashed 90% target line
            const xTarget = x.getPixelForValue(90);
            c.beginPath();
            c.setLineDash([5, 5]);
            c.lineWidth = 1.6;
            c.strokeStyle = darkNow ? 'rgba(56, 189, 248, 0.85)' : 'rgba(2, 132, 199, 0.8)';
            c.moveTo(xTarget, top);
            c.lineTo(xTarget, bottom);
            c.stroke();

            // Target badge
            c.setLineDash([]);
            c.font = `600 ${compactNow ? 10 : 11}px "Anuphan", "Plus Jakarta Sans", sans-serif`;
            const targetLabel = 'เป้า 90%';
            const pillW = c.measureText(targetLabel).width + (compactNow ? 10 : 14);
            const pillH = compactNow ? 18 : 20;
            const pillX = Math.min(xTarget - pillW / 2, chart.width - pillW - 4);
            const pillY = top - (compactNow ? 22 : 24);

            c.fillStyle = darkNow ? '#0284c7' : '#0369a1';
            if (typeof c.roundRect === 'function') {
              c.beginPath();
              c.roundRect(pillX, pillY, pillW, pillH, 6);
              c.fill();
            } else {
              c.fillRect(pillX, pillY, pillW, pillH);
            }
            c.fillStyle = '#ffffff';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(targetLabel, pillX + pillW / 2, pillY + pillH / 2 + 0.5);

            // 2. End-of-bar percentage labels
            const meta = chart.getDatasetMeta(0);
            const dataset = chart.data.datasets[0];
            if (meta && meta.data && dataset) {
              c.font = `600 ${compactNow ? 10.5 : 11.5}px "JetBrains Mono", monospace`;
              c.fillStyle = darkNow ? '#f1f5f9' : '#0f172a';
              c.textAlign = 'left';
              c.textBaseline = 'middle';

              meta.data.forEach((bar, index) => {
                const val = dataset.data[index];
                if (val === undefined || val === null) return;
                c.fillText(`${Number(val).toFixed(compactNow ? 1 : 2)}%`, bar.x + 6, bar.y);
              });
            }

            c.restore();
          } catch {
            // safe guard
          }
        },
      };

      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: initialRows.map((r) =>
            compact && r.department.length > 13 ? `${r.department.slice(0, 12)}…` : r.department
          ),
          datasets: [
            {
              label: '% ปิดงาน',
              data: initialRows.map((r) => Number(r.rate.toFixed(2))),
              backgroundColor: initialRows.map((r) => getBarColor(r.rate)),
              borderRadius: compact ? 6 : 8,
              borderSkipped: false,
              barPercentage: 0.68,
              categoryPercentage: 0.85,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          layout: {
            padding: {
              top: 28,
              right: compact ? 48 : 64,
              left: 2,
              bottom: 4,
            },
          },
          onClick: (_evt, elements) => {
            if (elements && elements.length > 0) {
              const clicked = rowsRef.current[elements[0].index];
              if (clicked) onSelectDeptRef.current(clicked.department);
            }
          },
          onHover: (event, elements) => {
            const target = event?.native?.target as HTMLElement | null;
            if (target) {
              target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
            }
          },
          scales: {
            x: {
              min: 0,
              max: 100,
              ticks: {
                stepSize: compact ? 25 : 20,
                color: dark ? '#94a3b8' : '#64748b',
                font: { family: '"JetBrains Mono", monospace', size: compact ? 10 : 11 },
                callback: (val) => `${val}%`,
              },
              grid: {
                color: dark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.22)',
              },
              border: { display: false },
            },
            y: {
              ticks: {
                color: dark ? '#e2e8f0' : '#1e293b',
                font: {
                  family: '"Anuphan", "Plus Jakarta Sans", sans-serif',
                  size: compact ? 11 : 12,
                  weight: 500,
                },
              },
              grid: { display: false },
              border: { display: false },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              titleFont: { family: '"Anuphan", "Plus Jakarta Sans", sans-serif', size: 13, weight: 600 },
              bodyFont: { family: '"Anuphan", "Plus Jakarta Sans", sans-serif', size: 12.5 },
              padding: 12,
              cornerRadius: 12,
              callbacks: {
                title: (items) => {
                  const idx = items[0]?.dataIndex ?? 0;
                  return rowsRef.current[idx]?.department || '';
                },
                label: (ctxItem) => {
                  const row = rowsRef.current[ctxItem.dataIndex];
                  if (!row) return '';
                  return [
                    ` % ปิดงาน: ${row.rate.toFixed(2)}%`,
                    ` ปิดงานแล้ว: ${row.closed.toLocaleString()} / ${row.total.toLocaleString()} MO`,
                    ` ยังไม่ปิด MO: ${row.open.toLocaleString()} รายการ`,
                  ];
                },
              },
            },
          },
        },
        plugins: [sapChartOverlayPlugin],
      });
      setUseFallback(false);
    } catch (err) {
      console.warn('Chart.js render error, switching to HTML bar fallback:', err);
      setUseFallback(true);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  // Update existing chart smoothly in-place without destroy/re-animate flicker
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.data.labels = rows.map((r) =>
      isCompactMobile && r.department.length > 13 ? `${r.department.slice(0, 12)}…` : r.department
    );
    const ds = chart.data.datasets[0];
    if (ds) {
      ds.data = rows.map((r) => Number(r.rate.toFixed(2)));
      ds.backgroundColor = rows.map((r) => getBarColor(r.rate));
      ds.borderRadius = isCompactMobile ? 6 : 8;
    }

    if (chart.options.layout && typeof chart.options.layout === 'object') {
      chart.options.layout.padding = {
        top: 28,
        right: isCompactMobile ? 48 : 64,
        left: 2,
        bottom: 4,
      };
    }

    const xScale = chart.options.scales?.x;
    if (xScale && xScale.ticks) {
      const linearTicks = xScale.ticks as { stepSize?: number; color?: string; font?: Record<string, unknown> };
      linearTicks.stepSize = isCompactMobile ? 25 : 20;
      linearTicks.color = isDark ? '#94a3b8' : '#64748b';
      linearTicks.font = { family: '"JetBrains Mono", monospace', size: isCompactMobile ? 10 : 11 };
    }
    if (xScale && xScale.grid) {
      xScale.grid.color = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.22)';
    }

    const yScale = chart.options.scales?.y;
    if (yScale && yScale.ticks) {
      yScale.ticks.color = isDark ? '#e2e8f0' : '#1e293b';
      yScale.ticks.font = {
        family: '"Anuphan", "Plus Jakarta Sans", sans-serif',
        size: isCompactMobile ? 11 : 12,
        weight: 500,
      };
    }

    chart.update('none');
  }, [rows, isDark, isCompactMobile]);

  const dynamicHeight = Math.max(360, rows.length * (isCompactMobile ? 33 : 36) + 70);

  if (useFallback) {
    return (
      <div className="space-y-2.5 py-2 overflow-y-auto" style={{ maxHeight: dynamicHeight }}>
        {rows.map((r) => (
          <button
            key={r.department}
            type="button"
            onClick={() => onSelectDept(r.department)}
            className="w-full text-left cursor-pointer group active:scale-[0.985] transition-transform"
          >
            <div className="flex justify-between text-xs mb-1">
              <span className="font-heading font-medium text-slate-700 dark:text-slate-200 group-hover:text-sky-600">
                {r.department}
              </span>
              <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                {r.rate.toFixed(2)}%
              </span>
            </div>
            <div className="h-3.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(r.rate, 100)}%`, backgroundColor: getBarColor(r.rate) }}
              />
              <div className="absolute top-0 bottom-0 w-0.5 bg-sky-600/80" style={{ left: '90%' }} title="เป้า 90%" />
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height: `${dynamicHeight}px` }}>
      <canvas ref={canvasRef} />
    </div>
  );
};
