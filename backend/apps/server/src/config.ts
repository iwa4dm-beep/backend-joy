import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  ANON_KEY: z.string(),
  SERVICE_ROLE_KEY: z.string(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("/var/lib/pluto/storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  SMTP_URL: z.string().optional(),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().default(15 * 60),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().default(30 * 24 * 60 * 60),
});

export const env = schema.parse(process.env);
