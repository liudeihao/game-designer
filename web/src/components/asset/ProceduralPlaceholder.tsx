"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const HUES = [230, 270, 165, 40, 330];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Pixel-noise style placeholder per component spec. */
export function ProceduralPlaceholder({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const h0 = HUES[hash(seed) % HUES.length];
  const sat = 0.4;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const size = 64;
    c.width = size;
    c.height = size;
    const rng = (n: number) => {
      const x = Math.sin(n * 9999) * 10000;
      return x - Math.floor(x);
    };
    const base = hash(seed);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = rng(base + x * 17 + y * 3);
        const t = v > 0.55 ? 0.2 + v * 0.25 : 0.05;
        const l = 0.12 + v * 0.15;
        ctx.fillStyle = `hsla(${h0}, ${sat * 100}%, ${l * 100}%, ${t})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [seed, h0, sat]);

  return (
    <canvas
      ref={ref}
      className={cn("h-full w-full [image-rendering:pixelated]", className)}
      aria-hidden
    />
  );
}
