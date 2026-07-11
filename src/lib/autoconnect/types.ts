// Auto-Connect Studio shared types
export type Column = {
  name: string;
  type: string;      // Postgres type
  nullable?: boolean;
  default?: string;
  primary?: boolean;
  references?: { table: string; column: string };
  unique?: boolean;
};

export type TableDef = {
  name: string;
  columns: Column[];
  timestamps?: boolean;
  softDeletes?: boolean;
  indexes?: string[][];
};

export type LaravelRoute = {
  method: string;         // GET/POST/...
  uri: string;            // /api/posts/{id}
  controller?: string;    // App\Http\Controllers\PostController@show
  name?: string;
  middleware?: string[];
};

export type AnalyzeResult = {
  frontend: {
    detected: boolean;
    framework?: string;
    hasVite: boolean;
    apiCallSites: { file: string; snippet: string; line: number }[];
    envKeys: string[];
    baseUrls: string[];
  };
  backend: {
    detected: boolean;
    laravelVersion?: string;
    tables: TableDef[];
    models: { name: string; file: string; table?: string; fillable?: string[] }[];
    routes: LaravelRoute[];
    controllers: { name: string; file: string; methods: string[] }[];
    authGuard?: string;
    storageDisks: string[];
    envKeys: string[];
    rawMigrationFiles: number;
  };
  stats: {
    totalFiles: number;
    totalBytes: number;
    skipped: string[];
  };
};

export type IntegrationPlan = {
  tables: {
    name: string;
    columns: Column[];
    rls: "owner" | "public" | "admin_only";
    reason?: string;
  }[];
  endpoints: {
    laravel: string;               // "GET /api/posts"
    pluto: string;                 // "GET /rest/v3/posts"
    kind: "rest" | "rpc";
    rpcName?: string;
    notes?: string;
  }[];
  frontendRewrites: {
    file: string;
    from: string;
    to: string;
    reason: string;
  }[];
  envMap: Record<string, string>;
  storageBuckets: { name: string; public: boolean }[];
  auth: { source: string; target: "pluto_jwt"; notes: string };
  risks: { severity: "low" | "med" | "high"; message: string }[];
};

export type Artifact = {
  name: string;
  blob: Blob;
  size: number;
};
