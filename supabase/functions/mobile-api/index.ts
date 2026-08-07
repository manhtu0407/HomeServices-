import { createEdgeAuthenticator } from "./_shared/platform/auth.ts";
import { readEdgeEnv } from "../_shared/platform/env.ts";
import { createMobileApiHandler } from "./_shared/http.ts";
import { createEdgeServices } from "./_shared/domains.ts";

const env = readEdgeEnv((name) => Deno.env.get(name) ?? undefined);

Deno.serve(
  createMobileApiHandler({
    authenticate: createEdgeAuthenticator(env),
    services: createEdgeServices(env),
    releaseId: env.releaseId,
    environment: env.harnessEnvironment.name,
    environment: env.harnessEnvironment.name,
  }),
);
