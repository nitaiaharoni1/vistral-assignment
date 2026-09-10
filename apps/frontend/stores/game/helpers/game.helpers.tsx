import { createContext } from "react";
import { useContext } from "react";
import { useEffect } from "react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { GameStore } from "../game.store";

const GameStoreContext = createContext<GameStore | null>(null);

// Creates a game store and starts it for the page.
export function useCreateGameStore() {
  const store = useMemo(() => new GameStore(), []);
  useEffect(() => {
    store.start();
    return () => store.dispose();
  }, [store]);
  return store;
}

// Provides the game store to child components.
export function GameStoreProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}

// Reads the game store from context.
export function useGameStore() {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error("Game store is missing. Render inside GameStoreProvider.");
  return store;
}
