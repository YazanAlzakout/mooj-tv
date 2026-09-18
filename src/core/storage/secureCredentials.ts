import * as SecureStore from "expo-secure-store";

import type { XtreamCredentials } from "@/domain/provider/types";

/**
 * Provider credentials live only here (SecureStore), never in SQLite or
 * anywhere logged — master prompt §8/§30. Keyed by provider id so each
 * saved provider has its own entry.
 */
function keyFor(providerId: string): string {
  return `provider-credentials-${providerId}`;
}

export async function saveProviderCredentials(
  providerId: string,
  credentials: XtreamCredentials
): Promise<void> {
  await SecureStore.setItemAsync(keyFor(providerId), JSON.stringify(credentials));
}

export async function getProviderCredentials(providerId: string): Promise<XtreamCredentials | null> {
  const raw = await SecureStore.getItemAsync(keyFor(providerId));
  if (!raw) return null;
  return JSON.parse(raw) as XtreamCredentials;
}

export async function deleteProviderCredentials(providerId: string): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(providerId));
}
