import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

/**
 * IconTrail - Green SVG icons spawning along mouse path
 * Extracted from app.1715958947476.js lines 69545 (80px threshold)
 * 
 * Features:
 * - Spawns at 80px mouse travel threshold
 * - Green colors: #2D8B4E, #00A86B, #1FAB5C, #3CB371
 * - Continuous rotation during drift
 * - Drifts downward
 */

const icons = [
  // Smiley face
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3.5-9c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm7 0c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>,
  // Star
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  // Lightning
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>,
  // Sparkle
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>,
  // Heart
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>,
];

const colors = ['#2D8B4E', '#00A86B', '#1FAB5C', '#3CB371'];

const IconTrail = () => {
  const containerRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const lastRef = useRef({ x: 0, y: 0 });
  const travelRef = useRef(0);
  const [iconsList, setIconsList] = useState([]);
  const idCounter = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };

      // Calculate distance moved
      const dx = e.clientX - lastRef.current.x;
      const dy = e.clientY - lastRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      travelRef.current += dist;

      // 80px threshold from minified source (line ~69545)
      if (travelRef.current >= 80) {
        travelRef.current = 0;

        // Spawn new icon
        const newIcon = {
          id: idCounter.current++,
          x: e.clientX,
          y: e.clientY,
          icon: icons[Math.floor(Math.random() * icons.length)],
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
        };

        setIconsList(prev => [...prev.slice(-20), newIcon]); // Keep last 20 icons
      }

      lastRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Animate icons
  useEffect(() => {
    iconsList.forEach((icon) => {
      const el = document.getElementById(`icon-${icon.id}`);
      if (el) {
        gsap.to(el, {
          y: '+=100',
          rotation: '+=360',
          opacity: 0,
          duration: 2,
          ease: 'power1.out',
          onComplete: () => {
            setIconsList(prev => prev.filter(i => i.id !== icon.id));
          }
        });
      }
    });
  }, [iconsList]);

  return (
    <div ref={containerRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
      {iconsList.map((icon) => (
        <div
          key={icon.id}
          id={`icon-${icon.id}`}
          style={{
            position: 'absolute',
            left: icon.x,
            top: icon.y,
            width: 24,
            height: 24,
            color: icon.color,
            transform: `translate(-50%, -50%) rotate(${icon.rotation}deg)`,
          }}
        >
          {icon.icon}
        </div>
      ))}
    </div>
  );
};

export default IconTrail;
