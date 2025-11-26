import { createContext, useContext } from "react";

interface NestingContextType {
  nestingLevel: number;
}

const NestingContext = createContext<NestingContextType>({ nestingLevel: 0 });

export const useNesting = () => useContext(NestingContext);

export const NestingProvider: React.FC<{ children: React.ReactNode; level: number }> = ({
  children,
  level,
}) => {
  return (
    <NestingContext.Provider value={{ nestingLevel: level }}>{children}</NestingContext.Provider>
  );
};
