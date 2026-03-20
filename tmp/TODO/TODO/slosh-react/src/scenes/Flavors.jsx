import { useEffect, useRef, useState } from 'react';
import MouseFluid from '../components/MouseFluid';
import TextReveal from '../components/TextReveal';
import IconTrail from '../components/IconTrail';
import gsap from 'gsap';

/**
 * Flavors Page - Main page with mouse effects
 * 
 * Features:
 * - Cream/beige background
 * - "SIP SIP HOORAY!" text with paint stroke reveal
 * - White blob mouse trail
 * - Green icon trail
 * - Navigation bar
 * - Product imagery placeholder
 */

const Flavors = () => {
  const containerRef = useRef(null);
  const [showNav, setShowNav] = useState(false);

  useEffect(() => {
    // Fade in content
    gsap.fromTo(containerRef.current, 
      { opacity: 0 },
      { opacity: 1, duration: 1 }
    );

    setShowNav(true);
  }, []);

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: '#F5F1E8', // Cream/beige background
        overflow: 'hidden',
      }}
    >
      {/* Mouse Effects */}
      <MouseFluid active={true} />
      <TextReveal text="SIP SIP HOORAY!" />
      <IconTrail />

      {/* Navigation */}
      {showNav && (
        <nav style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          padding: '20px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
          fontFamily: 'FKGrotesk, monospace',
        }}>
          <div style={{
            fontFamily: 'steelfish-eb, sans-serif',
            fontSize: '24px',
            color: '#FF0837',
          }}>
            SLOSH
          </div>
          <div style={{
            display: 'flex',
            gap: '30px',
          }}>
            <a href="#flavors" style={{
              color: '#333',
              textDecoration: 'none',
              fontSize: '12px',
              textTransform: 'uppercase',
            }}>Flavors</a>
            <a href="#cheers" style={{
              color: '#333',
              textDecoration: 'none',
              fontSize: '12px',
              textTransform: 'uppercase',
            }}>Cheers</a>
          </div>
          <button style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px',
          }}>
            🔊
          </button>
        </nav>
      )}

      {/* Vertical Text */}
      <div style={{
        position: 'fixed',
        right: '20px',
        top: '50%',
        transform: 'translateY(-50%) rotate(90deg)',
        fontFamily: 'FKGrotesk, monospace',
        fontSize: '10px',
        color: '#666',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        whiteSpace: 'nowrap',
        zIndex: 5,
      }}>
        Guaranteed Good Times
      </div>

      {/* Product Image Placeholder */}
      <div style={{
        position: 'fixed',
        bottom: '10%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '300px',
        height: '400px',
        background: 'linear-gradient(135deg, #FFB6C1 0%, #FFC0CB 100%)',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 15,
        boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
      }}>
        <span style={{
          fontFamily: 'steelfish-eb, sans-serif',
          fontSize: '48px',
          color: '#FF0837',
        }}>
          SLOSH
        </span>
      </div>

      {/* Decorative Elements */}
      <div style={{
        position: 'fixed',
        top: '20%',
        left: '10%',
        fontSize: '30px',
        color: '#00A86B',
        zIndex: 5,
      }}>✦</div>
      <div style={{
        position: 'fixed',
        top: '30%',
        right: '15%',
        fontSize: '24px',
        color: '#00A86B',
        zIndex: 5,
      }}>⚡</div>
      <div style={{
        position: 'fixed',
        bottom: '30%',
        left: '15%',
        fontSize: '20px',
        color: '#00A86B',
        zIndex: 5,
      }}>★</div>
    </div>
  );
};

export default Flavors;
