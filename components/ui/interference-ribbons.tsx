"use client";

import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from "react";

export interface InterferenceRibbonsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  /** Array of colors for the ribbon wires. Default: logo palette */
  colors?: string[];
  /** Number of ribbon wire curves. Default: 42 */
  wireCount?: number;
  /** Speed multiplier for drift and twist wave. Default: 0.8 */
  speed?: number;
  /** Amplitude of the ribbon sway. Default: 1 */
  amplitude?: number;
  /** Frequency/wavelength of the interference twist. Default: 1 */
  frequency?: number;
  /** Wire thickness in pixels. Default: 1.2 */
  thickness?: number;
  /** Glow intensity (0 to 1). Default: 0.75 */
  glow?: number;
  /** Opacity of the background wires (0 to 1). Default: 0.85 */
  opacity?: number;
  /** Interactive mouse repulsion & twist. Default: true */
  interactive?: boolean;
  /** Color theme mode. Default: false */
  lightMode?: boolean;
  style?: CSSProperties;
}

const DEFAULT_DARK_COLORS = [
  "#a865fb", // Logo vibrant purple
  "#7b50fd", // Logo deep violet
  "#c084fc", // Radiant light violet
  "#6366f1", // Indigo
  "#38bdf8", // Electric cyan accent for optical interference shimmer
];

const DEFAULT_LIGHT_COLORS = [
  "#7b50fd",
  "#a865fb",
  "#6366f1",
  "#9333ea",
  "#4f46e5",
];

export function InterferenceRibbons({
  colors,
  wireCount = 42,
  speed = 0.8,
  amplitude = 1,
  frequency = 1,
  thickness = 1.2,
  glow = 0.75,
  opacity = 0.85,
  interactive = true,
  lightMode = false,
  className = "",
  style,
  ...rest
}: InterferenceRibbonsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activeColors =
    colors && colors.length > 0
      ? colors
      : lightMode
      ? DEFAULT_LIGHT_COLORS
      : DEFAULT_DARK_COLORS;

  const propsRef = useRef({
    activeColors,
    wireCount,
    speed,
    amplitude,
    frequency,
    thickness,
    glow,
    opacity,
    interactive,
    lightMode,
  });

  useEffect(() => {
    propsRef.current = {
      activeColors,
      wireCount,
      speed,
      amplitude,
      frequency,
      thickness,
      glow,
      opacity,
      interactive,
      lightMode,
    };
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let rafId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const mouse = {
      x: -9999,
      y: -9999,
      targetX: -9999,
      targetY: -9999,
      active: false,
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
      mouse.active = true;
    };

    const handlePointerLeave = () => {
      mouse.active = false;
      mouse.targetX = -9999;
      mouse.targetY = -9999;
    };

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", handlePointerLeave);

    let time = 0;
    let lastTime = performance.now();

    const parseHex = (hex: string): [number, number, number] => {
      let clean = hex.replace("#", "");
      if (clean.length === 3) {
        clean = clean
          .split("")
          .map((c) => c + c)
          .join("");
      }
      const num = parseInt(clean, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const p = propsRef.current;
      time += dt * p.speed * 0.75;

      // Smooth mouse follow
      if (mouse.active) {
        if (mouse.x === -9999) {
          mouse.x = mouse.targetX;
          mouse.y = mouse.targetY;
        } else {
          mouse.x += (mouse.targetX - mouse.x) * 0.08;
          mouse.y += (mouse.targetY - mouse.y) * 0.08;
        }
      } else {
        mouse.x += (-9999 - mouse.x) * 0.05;
        mouse.y += (-9999 - mouse.y) * 0.05;
      }

      ctx.clearRect(0, 0, width, height);

      // Ribbon spine path parameters
      const numWires = Math.max(8, p.wireCount);
      const points = 70; // resolution along each wire
      const ribbonWidth = Math.min(width, height) * 0.38 * p.amplitude;
      const palette = p.activeColors.map(parseHex);

      // Enable additive-like interference blending
      ctx.globalCompositeOperation = p.lightMode ? "source-over" : "lighter";

      for (let w = 0; w < numWires; w++) {
        // Wire normalized offset across the ribbon (-1 to 1)
        const wireOffsetNorm = (w / (numWires - 1) - 0.5) * 2;
        const colorIdx = (w / (numWires - 1)) * (palette.length - 1);
        const c1 = palette[Math.floor(colorIdx)];
        const c2 = palette[Math.min(palette.length - 1, Math.floor(colorIdx) + 1)];
        const frac = colorIdx - Math.floor(colorIdx);

        const r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
        const g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
        const b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);

        // Interference shimmer intensity
        const shimmer = 0.55 + 0.45 * Math.sin(time * 2.2 + w * 0.25);
        const wireAlpha = Math.min(
          1,
          p.opacity *
            shimmer *
            (1 - Math.abs(wireOffsetNorm) * 0.35) *
            (p.lightMode ? 0.65 : 0.85)
        );

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${wireAlpha})`;
        ctx.lineWidth = p.thickness;
        if (p.glow > 0 && !p.lightMode) {
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${p.glow * 0.8})`;
          ctx.shadowBlur = 8 * p.glow;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();

        for (let i = 0; i <= points; i++) {
          const t = i / points; // 0 (left) to 1 (right)

          // Base horizontal curve flowing across screen diagonally
          const baseX = t * (width + 120) - 60;
          const baseY =
            height * 0.48 +
            Math.sin(t * Math.PI * 2 * p.frequency + time * 1.1) * (height * 0.18) +
            Math.cos(t * Math.PI * 3.4 * p.frequency - time * 0.8) * (height * 0.08);

          // Interference ribbon twist angle along the path
          const twistAngle =
            t * Math.PI * 4 * p.frequency +
            time * 1.4 +
            Math.sin(t * 5.0 + time * 0.9) * 1.2;

          // Wire lateral spread modulated by twisting wave
          const spread =
            wireOffsetNorm * ribbonWidth * Math.sin(twistAngle) * (0.6 + 0.4 * Math.sin(t * Math.PI));
          const depthSpread =
            wireOffsetNorm * ribbonWidth * Math.cos(twistAngle) * 0.35;

          // Perpendicular normal vector
          const nx = -Math.sin(twistAngle * 0.6);
          const ny = Math.cos(twistAngle * 0.6);

          let px = baseX + nx * spread;
          let py = baseY + ny * spread + depthSpread;

          // Interactive cursor reaction (wires bend around the pointer)
          if (p.interactive && mouse.x > -1000) {
            const dx = px - mouse.x;
            const dy = py - mouse.y;
            const dist = Math.hypot(dx, dy);
            const maxDist = 220;
            if (dist < maxDist && dist > 1) {
              const force = (1 - dist / maxDist) ** 2;
              const angle = Math.atan2(dy, dx);
              px += Math.cos(angle) * force * 55;
              py += Math.sin(angle) * force * 55;
            }
          }

          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }

        ctx.stroke();
      }

      // Secondary undulating ribbon for multi-layer depth & moiré interference
      for (let w = 0; w < Math.floor(numWires * 0.6); w++) {
        const wireOffsetNorm = (w / (Math.floor(numWires * 0.6) - 1) - 0.5) * 2;
        const color = palette[w % palette.length];
        const [r, g, b] = color;
        const wireAlpha = p.opacity * 0.45 * (p.lightMode ? 0.4 : 0.6);

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${wireAlpha})`;
        ctx.lineWidth = p.thickness * 0.9;
        ctx.shadowBlur = 0;

        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const t = i / points;
          const baseX = t * (width + 100) - 50;
          const baseY =
            height * 0.54 +
            Math.cos(t * Math.PI * 2.5 * p.frequency - time * 0.9) * (height * 0.22) +
            Math.sin(t * Math.PI * 1.5 * p.frequency + time * 1.2) * (height * 0.09);

          const twistAngle =
            -t * Math.PI * 3.6 * p.frequency - time * 1.1 + Math.cos(t * 4.0) * 0.8;
          const spread = wireOffsetNorm * ribbonWidth * 0.7 * Math.sin(twistAngle);

          let px = baseX + Math.cos(twistAngle) * spread;
          let py = baseY + Math.sin(twistAngle) * spread;

          if (p.interactive && mouse.x > -1000) {
            const dx = px - mouse.x;
            const dy = py - mouse.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 180 && dist > 1) {
              const force = (1 - dist / 180) ** 2;
              px += (dx / dist) * force * 40;
              py += (dy / dist) * force * 40;
            }
          }

          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "source-over";
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={["relative h-full w-full overflow-hidden pointer-events-none", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      {...rest}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
    </div>
  );
}

export default InterferenceRibbons;
