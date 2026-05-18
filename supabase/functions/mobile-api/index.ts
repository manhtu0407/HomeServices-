import { createEdgeAuthenticator } from "./_shared/auth.ts";
import { readEdgeEnv } from "./_shared/env.ts";
import { createMobileApiHandler } from "./_shared/router.ts";
import { createEdgeServices } from "./_shared/services.ts";

const env = readEdgeEnv((name) => Deno.env.get(name) ?? undefined);

Deno.serve(
  createMobileApiHandler({
    authenticate: createEdgeAuthenticator(env),
    services: createEdgeServices(env),
  }),
);
