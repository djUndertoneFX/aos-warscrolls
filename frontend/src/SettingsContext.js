import React, { createContext, useContext, useState } from 'react';

const SettingsContext = createContext({});

function loadSetting(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

export function SettingsProvider({ children }) {
  const [showFlavorText,      setShowFlavorText]      = useState(() => loadSetting('aos-setting-flavor-text', false));
  const [calculateDynamicAWO, setCalculateDynamicAWO] = useState(() => loadSetting('aos-setting-dynamic-awo', false));
  const [presumedSave,        setPresumedSave]        = useState(() => loadSetting('aos-setting-presumed-save', 5));
  const [presumedWard,        setPresumedWard]        = useState(() => loadSetting('aos-setting-presumed-ward', null));

  const setSetting = (key, value) => {
    switch (key) {
      case 'showFlavorText':
        setShowFlavorText(value);
        localStorage.setItem('aos-setting-flavor-text', JSON.stringify(value));
        break;
      case 'calculateDynamicAWO':
        setCalculateDynamicAWO(value);
        localStorage.setItem('aos-setting-dynamic-awo', JSON.stringify(value));
        break;
      case 'presumedSave':
        setPresumedSave(value);
        localStorage.setItem('aos-setting-presumed-save', JSON.stringify(value));
        break;
      case 'presumedWard':
        setPresumedWard(value);
        localStorage.setItem('aos-setting-presumed-ward', JSON.stringify(value));
        break;
      default: break;
    }
  };

  return (
    <SettingsContext.Provider value={{ showFlavorText, calculateDynamicAWO, presumedSave, presumedWard, setSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
