// TODO Phase 3: Storage API.
//
// Buckets:
//   GET    /buckets                       -> list
//   POST   /buckets        { name, public } -> create
//   DELETE /buckets/:name                 -> delete
//
// Objects:
//   POST   /object/:bucket/*              -> multipart upload (key = wildcard)
//   GET    /object/:bucket/*              -> stream (public bucket or signed URL)
//   DELETE /object/:bucket/*              -> remove
//   POST   /object/sign/:bucket/*  { expires_in } -> { url }
//
// Drivers:
//   - local: write to STORAGE_LOCAL_DIR/<bucket>/<key>
//   - s3:    @aws-sdk/client-s3 + getSignedUrl()

import type { FastifyInstance } from "fastify";

export async function storageRoutes(app: FastifyInstance) {
  app.get("/buckets", async () => ({ todo: "phase-3" }));
}
