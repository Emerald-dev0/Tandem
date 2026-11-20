"use client";

import { useEffect, useRef } from "react";

/** Soft light that trails the cursor — desktop only, purely decorative. */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover:hover)").matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const move = (e: MouseEvent) => {
      tx = e.clientX; ty = e.clientY;
      el.style.opacity = "1";
    };
    const tick = () => {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      el.style.left = x + "px"; el.style.top = y + "px";
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", move);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div className="cursor-glow" ref={ref} />;
}
