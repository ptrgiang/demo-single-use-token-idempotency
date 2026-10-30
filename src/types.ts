export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  DEMO_SIGNING_KEY: string;
  DEMO_REMOTE?: string;
  DEMO_ACCESS_TOKEN?: string;
};

export type TraceEntry = {
  stage: string;
  detail: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    trace: TraceEntry[];
  };
};
