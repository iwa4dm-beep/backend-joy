import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { authRoutes } from "./modules/auth/routes.js";
import { restRoutes } from "./modules/rest/routes.js";
import { storageRoutes } from "./modules/storage/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { env } from "./config.js";

async function main() {
  const app = Fastify({ logger: { level: "info" } });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  app.get("/healthz", async () => ({ ok: true, service: "pluto", version: "0.1.0" }));

  await app.register(authRoutes, { prefix: "/auth/v1" });
  await app.register(restRoutes, { prefix: "/rest/v1" });
  await app.register(storageRoutes, { prefix: "/storage/v1" });
  await app.register(adminRoutes, { prefix: "/admin/v1" });

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  app.log.info(`Pluto API listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
