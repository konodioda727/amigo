import { createContext, useContext } from "react";

interface NestingContextType {
  nestingLevel: number;
  taskId?: string;
}

const NestingContext = createContext<NestingContextType>({ nestingLevel: 0 });

export const useNesting = () => useContext(NestingContext);

export const useTaskId = () => {
  const context = useContext(NestingContext);
  return context.taskId || null;
};

export const NestingProvider: React.FC<{ 
  children: React.ReactNode; 
  level: number;
  taskId?: string;
}> = ({
  children,
  level,
  taskId,
}) => {
  return (
    <NestingContext.Provider value={{ nestingLevel: level, taskId }}>
      {children}
    </NestingContext.Provider>
  );
};
