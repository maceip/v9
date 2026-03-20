import { useState, useEffect } from 'react';
import gsap from 'gsap';

/**
 * AgeGate - Age verification gate
 * Extracted from app.1715958947476.js lines 61932-62116
 * 
 * Features:
 * - "SLOSH" / "SELTZERS" text animation
 * - Age verification buttons
 * - SplitText-style character animation
 */

const AgeGate = ({ onPass }) => {
  const [showGate, setShowGate] = useState(true);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');

  useEffect(() => {
    // Animate title letters
    const titleChars = document.querySelectorAll('.age-title-char');
    gsap.fromTo(titleChars, 
      { y: '100%', opacity: 0 },
      { 
        y: '0%', 
        opacity: 1, 
        duration: 0.6, 
        ease: 'power3.out',
        stagger: 0.03,
        delay: 0.2
      }
    );
  }, []);

  const handleYes = () => {
    localStorage.setItem('age_passed', 'true');
    setShowGate(false);
    onPass?.();
  };

  const handleNo = () => {
    window.location.href = 'https://www.google.com';
  };

  const title1 = 'SLOSH';
  const title2 = 'SELTZERS';

  if (!showGate) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: '#FFC1FF', // Pink background from source
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      fontFamily: 'steelfish-eb, sans-serif',
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <div style={{ overflow: 'hidden' }}>
          <h1 style={{
            fontSize: 'clamp(60px, 15vw, 150px)',
            color: '#FF0837', // Red from source
            margin: 0,
            lineHeight: 1,
            display: 'flex',
            justifyContent: 'center',
          }}>
            {title1.split('').map((char, i) => (
              <span key={i} className="age-title-char" style={{ display: 'inline-block' }}>
                {char}
              </span>
            ))}
          </h1>
        </div>
        <div style={{ overflow: 'hidden' }}>
          <h1 style={{
            fontSize: 'clamp(60px, 15vw, 150px)',
            color: '#FF0837',
            margin: 0,
            lineHeight: 1,
            display: 'flex',
            justifyContent: 'center',
          }}>
            {title2.split('').map((char, i) => (
              <span key={i} className="age-title-char" style={{ display: 'inline-block' }}>
                {char}
              </span>
            ))}
          </h1>
        </div>
      </div>

      {/* Age Verification */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '40px 60px',
        borderRadius: '20px',
        textAlign: 'center',
        maxWidth: '500px',
      }}>
        <p style={{
          fontFamily: 'FKGrotesk, monospace',
          fontSize: '14px',
          color: '#333',
          marginBottom: '30px',
          lineHeight: 1.6,
        }}>
          Please verify that you are of legal drinking age in your country.
        </p>

        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
          <button
            onClick={handleYes}
            style={{
              padding: '15px 40px',
              fontSize: '18px',
              fontFamily: 'steelfish-eb, sans-serif',
              background: '#00A86B',
              color: 'white',
              border: 'none',
              borderRadius: '30px',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
          >
            YES, I AM 21+
          </button>
          <button
            onClick={handleNo}
            style={{
              padding: '15px 40px',
              fontSize: '18px',
              fontFamily: 'steelfish-eb, sans-serif',
              background: '#FF0837',
              color: 'white',
              border: 'none',
              borderRadius: '30px',
              cursor: 'pointer',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
          >
            NO
          </button>
        </div>

        <p style={{
          fontFamily: 'FKGrotesk, monospace',
          fontSize: '11px',
          color: '#666',
          marginTop: '20px',
        }}>
          Please enjoy our products responsibly.
        </p>
      </div>
    </div>
  );
};

export default AgeGate;
