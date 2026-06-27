import React, { createContext, useContext, useState } from 'react';

const SettingsContext = createContext({});

export function SettingsProvider({ children }) {
  const [showFlavorText, setShowFlavorText] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aos-setting-flavor-text')) ?? false; } catch { return false; }
  });

  const setSetting = (key, value) => {
    if (key === 'showFlavorText') {
      setShowFlavorText(value);
      localStorage.setItem('aos-setting-flavor-text', JSON.stringify(value));
    }
  };

  return (
    <SettingsContext.Provider value={{ showFlavorText, setSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
