import { AsyncLocalStorage } from "node:async_hooks";
import { getRequestHeader } from "@tanstack/react-start/server";

const store = new AsyncLocalStorage<{ header: string }>();

export function readIncomingAuthHeader(): string | null {
  const fromStore = store.getStore()?.header;
  if (fromStore) return fromStore;
  try {
    const h = getRequestHeader("authorization");
    return h ?? null;
  } catch {
    return null;
  }
}

export function runWithAuthHeader<T>(header: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ header }, fn);
}
