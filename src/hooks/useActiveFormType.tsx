import { createContext, useContext, useState, useCallback } from "react";

type ActiveFormType = string | null;

interface ActiveFormTypeContextValue {
  activeFormType: ActiveFormType;
  setActiveFormType: (type: ActiveFormType) => void;
}

const ActiveFormTypeContext = createContext<ActiveFormTypeContextValue>({
  activeFormType: null,
  setActiveFormType: () => {},
});

export function ActiveFormTypeProvider({ children }: { children: React.ReactNode }) {
  const [activeFormType, setActiveFormTypeState] = useState<ActiveFormType>(null);

  const setActiveFormType = useCallback((type: ActiveFormType) => {
    setActiveFormTypeState(type);
  }, []);

  return (
    <ActiveFormTypeContext.Provider value={{ activeFormType, setActiveFormType }}>
      {children}
    </ActiveFormTypeContext.Provider>
  );
}

export function useActiveFormType() {
  return useContext(ActiveFormTypeContext);
}
