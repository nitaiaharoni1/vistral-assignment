import { createContext, useContext, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { GameStore } from "../game.store";

const GameStoreContext = createContext<GameStore | null>(null);

export function useCreateGameStore() {
  const store = useMemo(() => new GameStore(), []);
  useEffect(() => {
    store.start();
    return () => store.dispose();
  }, [store]);
  return store;
}

export function GameStoreProvider({
  store,
  children,
}: {
  store: GameStore;
  children: ReactNode;
}) {
  return (
    <GameStoreContext.Provider value={store}>
      {children}
    </GameStoreContext.Provider>
  );
}

export function useGameStore() {
  const store = useContext(GameStoreContext);
  if (!store)
    throw new Error("Game store is missing. Render inside GameStoreProvider.");
  return store;
}
