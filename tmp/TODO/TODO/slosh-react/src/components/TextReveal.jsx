import { useEffect, useRef, useCallback } from 'react';

/**
 * TextReveal - Paint stroke text fill effect
 * Extracted from app.1715958947476.js SplitText class (line ~56293)
 * and text fill behavior
 * 
 * Features:
 * - Cumulative paint stroke (fill stays after blob moves away)
 * - Green outline to green fill transition
 * - White blob provides contrast for reveal
 */

const TextReveal = ({ text = 'SIP SIP HOORAY!' }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const lettersRef = useRef([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef(null);

  const revealRadius = 180; // From minified source analysis

  useEffect(() => {
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
      z-index: 20;
    `;

    const ctx = canvas.getContext('2d');
    containerRef.current.appendChild(canvas);
    canvasRef.current = canvas;
    ctxRef.current = ctx;

    // Calculate text layout
    const fontSize = Math.min(window.innerWidth * 0.19, 220);
    ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = text.split(' ');
    const lineHeight = fontSize * 0.85;
    const centerY = window.innerHeight * 0.4;

    let currentY = centerY - (lines.length - 1) * lineHeight / 2;

    lettersRef.current = [];

    lines.forEach((line, lineIndex) => {
      const lineMetrics = ctx.measureText(line);
      let xOffset = (window.innerWidth - lineMetrics.width) / 2;
      const letterSpacing = fontSize * 0.02;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const charWidth = ctx.measureText(char).width;

        if (char !== ' ') {
          lettersRef.current.push({
            char,
            x: xOffset + charWidth / 2,
            y: currentY,
            width: charWidth + letterSpacing * 2,
            height: fontSize,
            accumulatedFill: 0,
            lastPaintedFill: 0,
            lineIndex
          });
        }
        xOffset += charWidth + letterSpacing;
      }

      currentY += lineHeight;
    });

    // Mouse tracking
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Animation loop
    const animate = () => {
      if (!ctxRef.current) return;

      const ctx = ctxRef.current;
      const mouse = mouseRef.current;

      // Clear and redraw
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const fontSize = Math.min(window.innerWidth * 0.19, 220);
      ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Update and draw each letter
      lettersRef.current.forEach((letter) => {
        const dx = mouse.x - letter.x;
        const dy = mouse.y - letter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate reveal amount based on proximity
        if (distance < revealRadius) {
          const normalized = 1 - (distance / revealRadius);
          const newFill = Math.pow(normalized, 2) * 0.08;
          letter.accumulatedFill = Math.min(1.0, letter.accumulatedFill + newFill);
        }

        // Draw fill (cumulative)
        if (letter.accumulatedFill > 0.01) {
          ctx.save();
          const alpha = letter.accumulatedFill * 0.95;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#00A165'; // Green fill
          ctx.fillText(letter.char, letter.x, letter.y);
          ctx.restore();
        }

        // Draw outline (fades as fill increases)
        ctx.save();
        ctx.strokeStyle = '#00A165';
        ctx.lineWidth = 1.5;
        const outlineAlpha = 0.25 * (1 - letter.accumulatedFill * 0.7);
        ctx.globalAlpha = Math.max(0.05, outlineAlpha);
        ctx.strokeText(letter.char, letter.x, letter.y);
        ctx.restore();
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
      if (canvasRef.current) {
        canvasRef.current.remove();
      }
    };
  }, [text]);

  return <div ref={containerRef} />;
};

export default TextReveal;
