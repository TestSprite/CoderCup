/**
 * Tiny helper for reading codearena/* secrets from AWS Secrets Manager.
 * Module-scope cache so repeated lookups across a single driver run
 * don't re-hit the API. Returns null if the secret doesn't exist or
 * has an empty value - callers fall back to stub behavior on null.
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });
const cache = new Map<string, string | null>();

export async function readSecret(secretId: string): Promise<string | null> {
  if (cache.has(secretId)) return cache.get(secretId) ?? null;
  try {
    const res = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    const value = res.SecretString ?? null;
    const valid = value && value.length > 0 ? value : null;
    cache.set(secretId, valid);
    return valid;
  } catch {
    cache.set(secretId, null);
    return null;
  }
}

export function _clearSecretCacheForTest(): void {
  cache.clear();
}
