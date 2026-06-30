import React, { createContext, useContext, useState } from 'react';

const SettingsContext = createContext({});

function loadSetting(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

export function SettingsProvider({ children }) {
  const [showFlavorText,        setShowFlavorText]        = useState(() => loadSetting('aos-setting-flavor-text', false));
  const [calculateDynamicADO,   setCalculateDynamicAWO]   = useState(() => loadSetting('aos-setting-dynamic-ado', false));
  const [presumedSave,          setPresumedSave]          = useState(() => loadSetting('aos-setting-presumed-save', 5));
  const [presumedWard,          setPresumedWard]          = useState(() => loadSetting('aos-setting-presumed-ward', null));
  const [roundingMode,          setRoundingMode]          = useState(() => loadSetting('aos-setting-rounding-mode', 'discrete'));
  // Faction Info slide toggles (all default on)
  const [showBattleTraits,      setShowBattleTraits]      = useState(() => loadSetting('aos-fi-battle-traits',      true));
  const [showBattleFormations,  setShowBattleFormations]  = useState(() => loadSetting('aos-fi-battle-formations',  true));
  const [showHeroicTraits,      setShowHeroicTraits]      = useState(() => loadSetting('aos-fi-heroic-traits',      false));
  const [showArtefacts,         setShowArtefacts]         = useState(() => loadSetting('aos-fi-artefacts',          false));
  const [showSpellLore,         setShowSpellLore]         = useState(() => loadSetting('aos-fi-spell-lore',         false));
  const [showManifestationLore, setShowManifestationLore] = useState(() => loadSetting('aos-fi-manifestation-lore', false));

  const setSetting = (key, value) => {
    const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    switch (key) {
      case 'showFlavorText':        setShowFlavorText(value);        persist('aos-setting-flavor-text', value);       break;
      case 'calculateDynamicADO':   setCalculateDynamicAWO(value);   persist('aos-setting-dynamic-ado', value);       break;
      case 'presumedSave':          setPresumedSave(value);          persist('aos-setting-presumed-save', value);     break;
      case 'presumedWard':          setPresumedWard(value);          persist('aos-setting-presumed-ward', value);     break;
      case 'roundingMode':          setRoundingMode(value);          persist('aos-setting-rounding-mode', value);     break;
      case 'showBattleTraits':      setShowBattleTraits(value);      persist('aos-fi-battle-traits', value);          break;
      case 'showBattleFormations':  setShowBattleFormations(value);  persist('aos-fi-battle-formations', value);      break;
      case 'showHeroicTraits':      setShowHeroicTraits(value);      persist('aos-fi-heroic-traits', value);          break;
      case 'showArtefacts':         setShowArtefacts(value);         persist('aos-fi-artefacts', value);              break;
      case 'showSpellLore':         setShowSpellLore(value);         persist('aos-fi-spell-lore', value);             break;
      case 'showManifestationLore': setShowManifestationLore(value); persist('aos-fi-manifestation-lore', value);     break;
      default: break;
    }
  };

  return (
    <SettingsContext.Provider value={{
      showFlavorText, calculateDynamicADO, presumedSave, presumedWard, roundingMode,
      showBattleTraits, showBattleFormations, showHeroicTraits, showArtefacts, showSpellLore, showManifestationLore,
      setSetting,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
