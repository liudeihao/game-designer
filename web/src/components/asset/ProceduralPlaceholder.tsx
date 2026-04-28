"use client";

import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const HUES = [168, 230, 200, 270, 40, 300];

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colorSchemeFromDom(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-gd-theme") === "light" ? "light" : "dark";
}

/** Seeded abstract geometry + waveform (no pixel noise) — unique per seed, clean “digital” art. */
export function ProceduralPlaceholder({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, scheme: "light" | "dark") => {
      if (w < 2 || h < 2) return;
      const s = hashString(seed);
      const rng = mulberry32(s);
      const hMain = HUES[s % HUES.length];
      const hAlt = HUES[(s >> 3) % HUES.length];
      const sat = 38 + rng() * 20;

      ctx.clearRect(0, 0, w, h);

      if (scheme === "light") {
        const baseL = 90 + rng() * 5;
        ctx.fillStyle = `hsl(${hMain}, 20%, ${baseL}%)`;
        ctx.fillRect(0, 0, w, h);

        const nTri = 4 + (s % 3);
        for (let i = 0; i < nTri; i++) {
          const cx = rng() * w;
          const cy = rng() * h * 0.85;
          const r = (8 + rng() * 22) * Math.min(1, w / 100);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(0) * r, cy + Math.sin(0) * r);
          const a1 = (Math.PI * 2) / 3;
          const a2 = (Math.PI * 4) / 3;
          ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
          ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
          ctx.closePath();
          const alpha = 0.07 + rng() * 0.12;
          ctx.fillStyle = `hsla(${hMain + rng() * 30 - 15}, ${sat}%, 58%, ${alpha})`;
          ctx.fill();
        }

        ctx.strokeStyle = `hsla(${hAlt}, ${sat}%, 36%, ${0.2 + rng() * 0.12})`;
        ctx.lineWidth = Math.max(0.5, 0.35 + (w / 400) * 0.75);
        ctx.beginPath();
        const y0 = h * (0.45 + rng() * 0.15);
        for (let x = 0; x <= w; x += 2) {
          const t = (x / w) * Math.PI * (2.2 + rng());
          const y = y0 + Math.sin(t + s * 0.01) * h * 0.08;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const curves = 2 + (s % 2);
        for (let c = 0; c < curves; c++) {
          const yB = h * (0.2 + rng() * 0.5);
          ctx.beginPath();
          ctx.moveTo(0, yB);
          ctx.bezierCurveTo(
            w * (0.2 + rng() * 0.2),
            yB + (rng() - 0.5) * h * 0.2,
            w * (0.55 + rng() * 0.2),
            yB + (rng() - 0.5) * h * 0.25,
            w,
            yB + (rng() - 0.5) * h * 0.1
          );
          ctx.strokeStyle = `hsla(${hMain + 20}, ${sat - 5}%, 44%, ${0.14 + rng() * 0.1})`;
          ctx.stroke();
        }
        return;
      }

      const baseL = 7 + rng() * 3;
      ctx.fillStyle = `hsl(${hMain}, 25%, ${baseL}%)`;
      ctx.fillRect(0, 0, w, h);

      const nTri = 4 + (s % 3);
      for (let i = 0; i < nTri; i++) {
        const cx = rng() * w;
        const cy = rng() * h * 0.85;
        const r = (8 + rng() * 22) * Math.min(1, w / 100);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(0) * r, cy + Math.sin(0) * r);
        const a1 = (Math.PI * 2) / 3;
        const a2 = (Math.PI * 4) / 3;
        ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
        ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
        ctx.closePath();
        const alpha = 0.1 + rng() * 0.12;
        ctx.fillStyle = `hsla(${hMain + rng() * 30 - 15}, ${sat}%, 42%, ${alpha})`;
        ctx.fill();
      }

      ctx.strokeStyle = `hsla(${hAlt}, ${sat}%, 55%, ${0.2 + rng() * 0.1})`;
      ctx.lineWidth = Math.max(0.5, 0.4 + (w / 400) * 0.8);
      ctx.beginPath();
      const y0 = h * (0.45 + rng() * 0.15);
      for (let x = 0; x <= w; x += 2) {
        const t = (x / w) * Math.PI * (2.2 + rng());
        const y = y0 + Math.sin(t + s * 0.01) * h * 0.08;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const curves = 2 + (s % 2);
      for (let c = 0; c < curves; c++) {
        const yB = h * (0.2 + rng() * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, yB);
        ctx.bezierCurveTo(
          w * (0.2 + rng() * 0.2),
          yB + (rng() - 0.5) * h * 0.2,
          w * (0.55 + rng() * 0.2),
          yB + (rng() - 0.5) * h * 0.25,
          w,
          yB + (rng() - 0.5) * h * 0.1
        );
        ctx.strokeStyle = `hsla(${hMain + 20}, ${sat - 5}%, 48%, ${0.12 + rng() * 0.1})`;
        ctx.stroke();
      }
    },
    [seed]
  );

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const run = () => {
      const parent = c.parentElement;
      const w = parent ? parent.clientWidth : c.clientWidth;
      const h = parent ? parent.clientHeight : c.clientHeight;
      if (w < 1 || h < 1) return;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, w, h, colorSchemeFromDom());
    };
    run();
    const ro = new ResizeObserver(() => run());
    if (c.parentElement) ro.observe(c.parentElement);
    ro.observe(c);
    const mo = new MutationObserver(() => run());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-gd-theme"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [draw, seed]);

  return (
    <canvas
      ref={ref}
      className={cn("block h-full w-full object-cover", className)}
      aria-hidden
    />
  );
}
