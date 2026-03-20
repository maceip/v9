import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

/**
 * MouseFluid - Extracted from app.1715958947476.js lines 48076-48125
 * 
 * The mouse fluid effect that creates the white blob trail:
 * - Uses WebGL fluid simulation
 * - Lerp alpha: 0.05 (line 48087)
 * - Size mapping: velocity 0-5px → size 0-60 (line 48091)
 * - Size multiplier: 0.8 (line 48093)
 * - Delta mapping: distance 0-15px → delta 0-10 (line 48094)
 * - Color: #ffffff white (line 48084)
 */

const MouseFluid = ({ active = true }) => {
  const containerRef = useRef(null);
  const fluidRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const lastRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const targetScaleRef = useRef(1);
  const rafRef = useRef(null);

  const initFluid = useCallback(async () => {
    // Simplified fluid simulation using canvas
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    `;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    containerRef.current.appendChild(canvas);

    // Store fluid reference
    fluidRef.current = {
      canvas,
      ctx,
      drawInput: (x, y, dx, dy, color, size) => {
        // Draw white blob at mouse position
        ctx.globalCompositeOperation = 'screen';
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
        gradient.addColorStop(0, `rgba(255, 255, 255, 0.8)`);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, 0.3)`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // Add some blur/diffusion
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    return fluidRef.current;
  }, []);

  useEffect(() => {
    if (!active) return;

    initFluid();

    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const loop = () => {
      if (!fluidRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      // Lerp scale with ease 0.05 (line 48087)
      scaleRef.current += (targetScaleRef.current - scaleRef.current) * 0.05;

      const mouse = mouseRef.current;
      const last = lastRef.current;

      // Calculate distance
      const len = Math.sqrt(
        Math.pow(mouse.x - last.x, 2) + Math.pow(mouse.y - last.y, 2)
      );

      // Size based on velocity (line 48091)
      const size = Math.range(len, 0, 5, 0, 60, true);
      const finalSize = size * 0.8 * scaleRef.current; // line 48093

      // Delta factor (line 48094)
      const delta = Math.range(len, 0, 15, 0, 10, true);

      // Draw if moved more than 0.01 (line 48095)
      if (len > 0.01) {
        fluidRef.current.drawInput(
          mouse.x,
          mouse.y,
          (mouse.x - last.x) * delta,
          (mouse.y - last.y) * delta,
          { r: 1, g: 1, b: 1 }, // white (line 48084)
          finalSize
        );
      }

      lastRef.current = { ...mouse };
      rafRef.current = requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
      if (fluidRef.current?.canvas) {
        fluidRef.current.canvas.remove();
      }
    };
  }, [active, initFluid]);

  return <div ref={containerRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
};

export default MouseFluid;
