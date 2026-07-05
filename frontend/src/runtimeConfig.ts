export interface RuntimeConfig {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  cognitoDomain: string;
  region: string;
}

let cached: RuntimeConfig | undefined;

/**
 * Deploy-time values (API URL, Cognito IDs) are written to /config.json by
 * FrontendStack's BucketDeployment, rather than baked in at Vite build time --
 * this avoids a build-before-you-know-the-values ordering problem.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  const res = await fetch("/config.json");
  if (!res.ok) {
    throw new Error(`Failed to load /config.json (${res.status})`);
  }
  cached = (await res.json()) as RuntimeConfig;
  return cached;
}
