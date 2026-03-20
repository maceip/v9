import { useState, useEffect } from 'react';
import AgeGate from './components/AgeGate';
import Flavors from './scenes/Flavors';
import './App.css';

/**
 * Main App Component
 * 
 * Handles:
 * - Age gate verification
 * - Scene transitions
 * - Font loading
 */

function App() {
  const [agePassed, setAgePassed] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    // Check if age already passed
    const passed = localStorage.getItem('age_passed');
    if (passed === 'true') {
      setAgePassed(true);
    }

    // Load fonts
    document.fonts.ready.then(() => {
      setFontsLoaded(true);
    });
  }, []);

  const handleAgePass = () => {
    setAgePassed(true);
  };

  if (!fontsLoaded) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: '#FFC1FF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: 'steelfish-eb, sans-serif',
          fontSize: '24px',
          color: '#FF0837',
        }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {!agePassed && <AgeGate onPass={handleAgePass} />}
      {agePassed && <Flavors />}
    </div>
  );
}

export default App;
