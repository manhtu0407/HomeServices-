import {
  resolveApprovedWorkerSelfieUrl,
  resolveWorkerHomeAvatarUrl,
  workerVerificationSelfieObjectPath,
} from "./avatar.ts";

function expectEqual<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("accepts only the expected worker selfie path", () => {
  const workerId = "worker-avatar-test-1";
  expectEqual(
    workerVerificationSelfieObjectPath(
      `supabase://worker-verification/${workerId}/selfie/portrait.jpg`,
      workerId,
    ),
    `${workerId}/selfie/portrait.jpg`,
  );
  expectEqual(
    workerVerificationSelfieObjectPath(
      "supabase://worker-verification/other-worker/selfie/portrait.jpg",
      workerId,
    ),
    null,
  );
  expectEqual(
    workerVerificationSelfieObjectPath(
      `supabase://worker-verification/${workerId}/cccd-front/portrait.jpg`,
      workerId,
    ),
    null,
  );
  expectEqual(
    workerVerificationSelfieObjectPath(
      `supabase://worker-verification/${workerId}/selfie/portrait..jpg`,
      workerId,
    ),
    null,
  );
});

Deno.test("does not sign an unapproved selfie and uses a short-lived private URL", async () => {
  const workerId = "worker-avatar-test-2";
  const selfieRef = `supabase://worker-verification/${workerId}/selfie/portrait.webp`;
  let signedCalls = 0;
  let signedPath = "";
  let signedExpiry = 0;
  const storageClient = {
    storage: {
      from(bucket: string) {
        expectEqual(bucket, "worker-verification");
        return {
          createSignedUrl(path: string, expiresIn: number) {
            signedCalls += 1;
            signedPath = path;
            signedExpiry = expiresIn;
            return Promise.resolve({
              data: { signedUrl: "https://storage.example.test/selfie-signed" },
              error: null,
            });
          },
        };
      },
    },
  };

  expectEqual(
    await resolveApprovedWorkerSelfieUrl(storageClient, selfieRef, workerId, false),
    null,
  );
  expectEqual(signedCalls, 0);

  expectEqual(
    await resolveApprovedWorkerSelfieUrl(storageClient, selfieRef, workerId, true),
    "https://storage.example.test/selfie-signed",
  );
  expectEqual(signedCalls, 1);
  expectEqual(signedPath, `${workerId}/selfie/portrait.webp`);
  expectEqual(signedExpiry, 300);
});

Deno.test("prioritizes an explicit worker avatar over an approved selfie", async () => {
  const workerId = "worker-avatar-test-3";
  const storageClient = {
    storage: {
      from() {
        return {
          createSignedUrl() {
            return Promise.resolve({
              data: { signedUrl: "https://storage.example.test/selfie-signed" },
              error: null,
            });
          },
        };
      },
    },
  };

  expectEqual(
    await resolveWorkerHomeAvatarUrl(
      storageClient,
      "https://storage.example.test/worker-avatar.jpg",
      `supabase://worker-verification/${workerId}/selfie/portrait.jpg`,
      workerId,
      true,
    ),
    "https://storage.example.test/worker-avatar.jpg",
  );
});

Deno.test("does not use a selfie when an explicit avatar ref cannot be resolved", async () => {
  const workerId = "worker-avatar-test-4";
  const storageClient = {
    storage: {
      from() {
        return {
          createSignedUrl() {
            return Promise.resolve({ data: null, error: new Error("expired") });
          },
        };
      },
    },
  };

  expectEqual(
    await resolveWorkerHomeAvatarUrl(
      storageClient,
      `supabase://worker-avatars/${workerId}/avatar.jpg`,
      `supabase://worker-verification/${workerId}/selfie/portrait.jpg`,
      workerId,
      true,
    ),
    null,
  );
});
