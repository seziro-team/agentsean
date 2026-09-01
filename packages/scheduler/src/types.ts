export const JOB_KINDS = [
  "crawl",
  "gsc_sync",
  "cwv",
  "rank_check",
  "keywords",
  "content",
  "measure",
  "surfaces",
  "plan_and_apply",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobPayload = Record<string, unknown>;

export type Job = {
  id: string;
  siteId: string | null;
  kind: JobKind;
  status: JobStatus;
  idempotencyKey: string;
  payload: JobPayload;
  attempts: number;
  runAt: string | null;
  heartbeatAt: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type EnqueueInput = {
  siteId?: string | null | undefined;
  kind: JobKind;
  idempotencyKey: string;
  payload?: JobPayload | undefined;
  runAt?: Date | string | undefined;
};

export type JobQueue = {
  enqueue(input: EnqueueInput): Promise<Job>;
  claimDue(limit: number): Promise<Job[]>;
  heartbeat(id: string): Promise<void>;
  checkpoint(id: string, payload: JobPayload): Promise<void>;
  complete(id: string, result?: unknown): Promise<void>;
  fail(id: string, error: unknown): Promise<void>;
  recoverStale(): Promise<number>;
  cancel(id: string): Promise<void>;
  get(id: string): Promise<Job | null>;
  list(filter?: {
    siteId?: string | undefined;
    status?: JobStatus | undefined;
  }): Promise<Job[]>;
};

export type Clock = () => Date;

export type HandlerContext = {
  now: Date;
  heartbeat: () => void;
  checkpoint: (payload: JobPayload) => void;
  halted: boolean;
};

export type JobHandler = (job: Job, ctx: HandlerContext) => Promise<unknown>;
