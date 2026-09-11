"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Pending } from "@/lib/types";

type Props = {
  w: number; h: number; palette: string[];
  colors: Uint8Array; mine: Uint8Array;   // mine[i] = 1 where the viewer owns the pixel
  version: number;                        // bump to force redraw after buffer mutation
  pending: Pending[]; activeColor: number; showMine: boolean;
  onTap: (x: number, y: number) => void;
  onHover: (x: number, y: number) => void;
  onHoverEnd: () => void;
};

const BLANK = 255;

export function Board({ w, h, palette, colors, mine, version, pending, activeColor, showMine, onTap, onHover, onHoverEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const terrRef = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ scale: 1, ox: 0, oy: 0 });
  const [, force] = useState(0);
  const drag = useRef<{ x: number; y: number; moved: boolean; sx: number; sy: number } | null>(null);
  const pinch = useRef<{ d: number; scale: number } | null>(null);
  const hoverCell = useRef<{ x: number; y: number } | null>(null);

  // Rebuild offscreen bitmaps from buffers.
  useEffect(() => {
    if (!offRef.current) { offRef.current = document.createElement("canvas"); offRef.current.width = w; offRef.current.height = h; }
    if (!terrRef.current) { terrRef.current = document.createElement("canvas"); terrRef.current.width = w; terrRef.current.height = h; }
    const rgb = palette.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
    const ctx = offRef.current.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const tctx = terrRef.current.getContext("2d")!;
    const timg = tctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const c = colors[i];
      const o = i * 4;
      if (c === BLANK) { img.data[o] = 250; img.data[o + 1] = 250; img.data[o + 2] = 250; img.data[o + 3] = 255; }
      else { const [r, g, b] = rgb[c] ?? [0, 0, 0]; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; }
      if (mine[i]) { timg.data[o] = 200; timg.data[o + 1] = 255; timg.data[o + 2] = 0; timg.data[o + 3] = 170; }
    }
    ctx.putImageData(img, 0, 0);
    tctx.putImageData(timg, 0, 0);
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, w, h, palette, colors, mine]);

  const draw = useCallback(() => {
    const cv = canvasRef.current, off = offRef.current;
    if (!cv || !off) return;
    const ctx = cv.getContext("2d")!;
    const { scale, ox, oy } = view.current;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0);
    if (showMine && terrRef.current) ctx.drawImage(terrRef.current, 0, 0);
    // pending pixels
    for (const p of pending) {
      ctx.fillStyle = palette[p.color];
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    if (scale >= 6) {
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = "#0b0b0f";
      for (const p of pending) ctx.strokeRect(p.x + 1 / scale, p.y + 1 / scale, 1 - 2 / scale, 1 - 2 / scale);
      ctx.strokeStyle = "#c8ff00";
      for (const p of pending) ctx.strokeRect(p.x, p.y, 1, 1);
    }
    const hc = hoverCell.current;
    if (hc && scale >= 4) {
      ctx.fillStyle = palette[activeColor];
      ctx.globalAlpha = 0.6;
      ctx.fillRect(hc.x, hc.y, 1, 1);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(hc.x, hc.y, 1, 1);
    }
  }, [pending, palette, activeColor, showMine]);

  useEffect(() => { draw(); }, [draw]);

  // Resize + initial fit.
  useEffect(() => {
    const cv = canvasRef.current!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = cv.parentElement!.getBoundingClientRect();
      cv.width = rect.width * dpr; cv.height = rect.height * dpr;
      cv.style.width = `${rect.width}px`; cv.style.height = `${rect.height}px`;
      if (view.current.scale === 1 && view.current.ox === 0) {
        // Leave room for the top HUD (~130px) and bottom bar (~140px).
        const top = 130, bottom = 140;
        const s = Math.min(rect.width / w, (rect.height - top - bottom) / h);
        view.current = { scale: s, ox: (rect.width - w * s) / 2, oy: top + (rect.height - top - bottom - h * s) / 2 };
      }
      draw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv.parentElement!);
    return () => ro.disconnect();
  }, [w, h, draw]);

  const toCell = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { scale, ox, oy } = view.current;
    const x = Math.floor((clientX - rect.left - ox) / scale);
    const y = Math.floor((clientY - rect.top - oy) / scale);
    return x >= 0 && y >= 0 && x < w && y < h ? { x, y } : null;
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    const v = view.current;
    const ns = Math.max(0.5, Math.min(60, v.scale * factor));
    const k = ns / v.scale;
    view.current = { scale: ns, ox: px - (px - v.ox) * k, oy: py - (py - v.oy) * k };
    draw();
  };

  // Wheel needs a non-passive listener to prevent page zoom.
  useEffect(() => {
    const cv = canvasRef.current!;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false, sx: e.clientX, sy: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current && e.buttons) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (Math.hypot(e.clientX - drag.current.sx, e.clientY - drag.current.sy) > 4) drag.current.moved = true;
      drag.current.x = e.clientX; drag.current.y = e.clientY;
      view.current.ox += dx; view.current.oy += dy;
      draw();
      return;
    }
    const c = toCell(e.clientX, e.clientY);
    if (c?.x !== hoverCell.current?.x || c?.y !== hoverCell.current?.y) {
      hoverCell.current = c;
      if (c) onHover(c.x, c.y); else onHoverEnd();
      draw();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d || d.moved) return;
    const c = toCell(e.clientX, e.clientY);
    if (!c) return;
    // On touch, first tap on a far-out canvas zooms in so people can actually aim.
    if (e.pointerType === "touch" && view.current.scale < 6) { zoomTo(c.x, c.y, 14); return; }
    onTap(c.x, c.y);
  };
  const zoomTo = (x: number, y: number, s: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    view.current = { scale: s, ox: rect.width / 2 - (x + 0.5) * s, oy: rect.height / 2 - (y + 0.5) * s };
    draw(); force((n) => n + 1);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) { pinch.current = null; return; }
    const [a, b] = [e.touches[0], e.touches[1]];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch.current) { pinch.current = { d, scale: view.current.scale }; return; }
    const target = pinch.current.scale * (d / pinch.current.d);
    zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, target / view.current.scale);
    drag.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full touch-none select-none"
      style={{ cursor: "crosshair" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { hoverCell.current = null; onHoverEnd(); draw(); }}
      onTouchMove={onTouchMove}
      onTouchEnd={() => { pinch.current = null; }}
    />
  );
}
