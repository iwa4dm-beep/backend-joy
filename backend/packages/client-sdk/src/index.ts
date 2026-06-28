/**
 * @pluto/client
 *
 * Public surface only. The full implementation lands together with Phase 2
 * (Auth + REST) and Phase 3 (Storage). The Admin Dashboard ships with a
 * localStorage-backed mock implementation at apps/dashboard/src/lib/pluto/client.ts
 * with the same shape, so UIs can be built against the real types today.
 */

export type PlutoClientOptions = {
  url: string;
  anonKey: string;
  /** Persist session to storage (default: true in browser, false elsewhere). */
  persistSession?: boolean;
};

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email: string; role: "admin" | "user" };
};

export interface PlutoClient {
  auth: {
    signUp(args: { email: string; password: string }): Promise<{ session: Session }>;
    signIn(args: { email: string; password: string }): Promise<{ session: Session }>;
    signOut(): Promise<void>;
    getSession(): Session | null;
    onAuthStateChange(cb: (s: Session | null) => void): () => void;
  };
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
  storage: {
    from(bucket: string): {
      upload(path: string, file: Blob | File | ArrayBuffer): Promise<{ key: string }>;
      download(path: string): Promise<Blob>;
      remove(paths: string[]): Promise<void>;
      createSignedUrl(path: string, expiresIn: number): Promise<{ url: string }>;
    };
  };
}

export interface QueryBuilder<T> {
  select(cols?: string): this;
  eq(col: keyof T, value: unknown): this;
  gt(col: keyof T, value: unknown): this;
  in(col: keyof T, values: unknown[]): this;
  order(col: keyof T, opts?: { ascending?: boolean }): this;
  limit(n: number): this;
  range(from: number, to: number): this;
  then<R>(onfulfilled: (v: { data: T[]; error: null } | { data: null; error: Error }) => R): Promise<R>;
}

export function createPlutoClient(_opts: PlutoClientOptions): PlutoClient {
  throw new Error("@pluto/client: implementation lands in Phase 2. The Admin Dashboard mock at apps/dashboard/src/lib/pluto/client.ts mirrors this surface.");
}
