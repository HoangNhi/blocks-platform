import * as React from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  isBlock: boolean;
  pulse: number;
}

// ponytail: 2D canvas with direct RAF loop; no animation engine or worker. Upgrade when 100+ nodes or WebGL needed.
export function MotionCanvas(): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    let nodes: Node[] = [];
    const MAX_DISTANCE = 135;
    const POINTER_RADIUS = 160;

    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      active: false,
    };

    const initNodes = () => {
      const count = Math.max(
        30,
        Math.min(85, Math.floor(width * height * 0.000045))
      );
      nodes = [];
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.45,
          baseRadius: Math.random() * 1.5 + 1.2,
          isBlock: Math.random() > 0.65,
          pulse: Math.random() * Math.PI * 2,
        });
      }
    };

    const applyDimensions = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReduced = mql.matches;

    let rafId: number | null = null;
    let lastTime: number | null = null;

    const draw = (reduced: boolean) => {
      ctx.clearRect(0, 0, width, height);

      const len = nodes.length;

      for (let i = 0; i < len; i++) {
        const n = nodes[i];
        for (let j = i + 1; j < len; j++) {
          const n2 = nodes[j];
          const dx = n.x - n2.x;
          const dy = n.y - n2.y;
          const dist = Math.hypot(dx, dy);

          if (dist < MAX_DISTANCE) {
            const alpha = (1 - dist / MAX_DISTANCE) * 0.16;
            ctx.strokeStyle = `rgba(37, 99, 235, ${alpha})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          }
        }

        if (mouse.active) {
          const mdx = mouse.x - n.x;
          const mdy = mouse.y - n.y;
          const mdist = Math.hypot(mdx, mdy);
          if (mdist < POINTER_RADIUS) {
            const mAlpha = (1 - mdist / POINTER_RADIUS) * 0.22;
            ctx.strokeStyle = `rgba(37, 99, 235, ${mAlpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }

        const currentRadius =
          n.baseRadius + (reduced ? 0 : Math.sin(n.pulse) * 0.3);
        ctx.fillStyle = n.isBlock
          ? "rgba(30, 64, 175, 0.45)"
          : "rgba(37, 99, 235, 0.4)";

        if (n.isBlock) {
          const size = currentRadius * 1.8;
          ctx.fillRect(n.x - size / 2, n.y - size / 2, size, size);
        } else {
          ctx.beginPath();
          ctx.arc(n.x, n.y, currentRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const update = (timeScale: number) => {
      if (mouse.active) {
        mouse.x += (mouse.targetX - mouse.x) * Math.min(1, 0.12 * timeScale);
        mouse.y += (mouse.targetY - mouse.y) * Math.min(1, 0.12 * timeScale);
      }

      const len = nodes.length;
      for (let i = 0; i < len; i++) {
        const n = nodes[i];
        n.x += n.vx * timeScale;
        n.y += n.vy * timeScale;

        if (n.x < 0) n.x = width;
        else if (n.x > width) n.x = 0;
        if (n.y < 0) n.y = height;
        else if (n.y > height) n.y = 0;

        n.pulse += 0.02 * timeScale;

        if (mouse.active) {
          const dx = mouse.x - n.x;
          const dy = mouse.y - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist < POINTER_RADIUS && dist > 1) {
            const force = (1 - dist / POINTER_RADIUS) * 1.2;
            n.x -= (dx / dist) * force;
            n.y -= (dy / dist) * force;
          }
        }
      }
    };

    const loop = (timestamp: number) => {
      rafId = null;
      if (prefersReduced || document.visibilityState === "hidden") return;

      const rawDt = lastTime !== null ? timestamp - lastTime : 1000 / 60;
      const dt = Math.min(rawDt, 50);
      lastTime = timestamp;
      const timeScale = dt / (1000 / 60);

      update(timeScale);
      draw(false);

      rafId = requestAnimationFrame(loop);
    };

    const startAnimation = () => {
      if (prefersReduced || document.visibilityState === "hidden") return;
      if (rafId !== null) return;
      lastTime = null;
      rafId = requestAnimationFrame(loop);
    };

    const stopAnimation = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      lastTime = null;
    };

    const handleResize = () => {
      applyDimensions();
      initNodes();
      draw(prefersReduced);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;
    };

    const handlePointerLeave = () => {
      mouse.active = false;
      mouse.targetX = -1000;
      mouse.targetY = -1000;
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopAnimation();
      } else {
        startAnimation();
      }
    };

    const handleMediaChange = (e: MediaQueryListEvent | Event) => {
      prefersReduced =
        "matches" in e ? (e as MediaQueryListEvent).matches : mql.matches;
      if (prefersReduced) {
        stopAnimation();
        draw(true);
      } else {
        startAnimation();
      }
    };

    applyDimensions();
    initNodes();
    draw(prefersReduced);
    if (!prefersReduced && document.visibilityState !== "hidden") {
      startAnimation();
    }

    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    mql.addEventListener("change", handleMediaChange);

    return () => {
      stopAnimation();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      mql.removeEventListener("change", handleMediaChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
