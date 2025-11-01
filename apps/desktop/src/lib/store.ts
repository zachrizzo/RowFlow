import { Store } from '@tauri-apps/plugin-store';
import type { StoredProfile, SshConfig, TlsConfig } from '@/types/connection';

// Store keys
const PROFILES_KEY = 'connection_profiles';
const ACTIVE_PROFILE_KEY = 'active_profile_id';

// Initialize store lazily
let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load('rowflow-connections.json');
  }
  return storePromise;
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function parseNumber(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null) {
    return fallback;
  }
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num === 'number' && !Number.isNaN(num)) {
    return num;
  }
  return fallback;
}

function normalizeTlsConfig(raw: any): TlsConfig | undefined {
  if (!raw) {
    return undefined;
  }

  const verifyMode = raw.mode === 'verify-full' || raw.mode === 'verify-ca';
  const verifyCaFlag = raw.verifyCa ?? verifyMode;

  return {
    enabled: Boolean(raw.enabled),
    verifyCa: Boolean(verifyCaFlag),
    caCertPath: raw.caCertPath,
    clientCertPath: raw.clientCertPath,
    clientKeyPath: raw.clientKeyPath,
  };
}

function normalizeSshConfig(raw: any): SshConfig | undefined {
  if (!raw) {
    return undefined;
  }

  return {
    host: raw.host ?? 'localhost',
    port: parseNumber(raw.port, 22) ?? 22,
    username: raw.username ?? '',
    password: raw.password,
    privateKeyPath: raw.privateKeyPath,
    passphrase: raw.passphrase,
  };
}

function normalizeProfile(raw: any): StoredProfile {
  if (!raw) {
    throw new Error('Cannot normalize empty profile');
  }

  const tlsConfig = normalizeTlsConfig(raw.tlsConfig ?? raw.ssl);
  const sshConfig = normalizeSshConfig(raw.sshConfig ?? raw.sshTunnel);
  const useSsh = raw.useSsh ?? Boolean(sshConfig);

  return {
    id: String(raw.id ?? `profile-${Date.now()}`),
    name: raw.name ?? 'Untitled Connection',
    host: raw.host ?? 'localhost',
    port: parseNumber(raw.port, 5432) ?? 5432,
    database: raw.database ?? '',
    username: raw.username ?? '',
    password: raw.password,
    readOnly: Boolean(raw.readOnly),
    useSsh: Boolean(useSsh),
    sshConfig: useSsh ? sshConfig : undefined,
    tlsConfig,
    connectionTimeout: parseNumber(raw.connectionTimeout ?? raw.timeouts?.connection ?? raw.timeouts?.idle),
    statementTimeout: parseNumber(raw.statementTimeout ?? raw.timeouts?.statement),
    lockTimeout: parseNumber(raw.lockTimeout ?? raw.timeouts?.lock),
    idleTimeout: parseNumber(raw.idleTimeout ?? raw.timeouts?.idle),
    createdAt: parseTimestamp(raw.createdAt),
    updatedAt: parseTimestamp(raw.updatedAt),
    isMcpManaged: Boolean(raw.isMcpManaged),
  };
}

/**
 * Save a connection profile to the store
 */
export async function saveProfile(profile: StoredProfile): Promise<void> {
  const store = await getStore();
  const profiles = await getProfiles();
  const existingIndex = profiles.findIndex((p) => p.id === profile.id);
  const normalized = normalizeProfile(profile);

  if (existingIndex >= 0) {
    profiles[existingIndex] = normalized;
  } else {
    profiles.push(normalized);
  }

  await store.set(PROFILES_KEY, profiles);
  await store.save();
}

/**
 * Get all connection profiles from the store
 */
export async function getProfiles(): Promise<StoredProfile[]> {
  const store = await getStore();
  const rawProfiles = await store.get<any[]>(PROFILES_KEY);
  if (!rawProfiles) {
    return [];
  }
  return rawProfiles.map(normalizeProfile);
}

/**
 * Get a single profile by ID
 */
export async function getProfile(id: string): Promise<StoredProfile | undefined> {
  const profiles = await getProfiles();
  return profiles.find((p) => p.id === id);
}

/**
 * Delete a connection profile from the store
 */
export async function deleteProfile(id: string): Promise<void> {
  const store = await getStore();
  const profiles = await getProfiles();
  const filtered = profiles.filter((p) => p.id !== id);

  await store.set(PROFILES_KEY, filtered);
  await store.save();

  // If the deleted profile was active, clear the active profile
  const activeId = await getActiveProfileId();
  if (activeId === id) {
    await setActiveProfileId(null);
  }
}

/**
 * Get the active profile ID
 */
export async function getActiveProfileId(): Promise<string | null> {
  const store = await getStore();
  const activeId = await store.get<string | null>(ACTIVE_PROFILE_KEY);
  return activeId || null;
}

/**
 * Set the active profile ID
 */
export async function setActiveProfileId(id: string | null): Promise<void> {
  const store = await getStore();
  if (id === null) {
    await store.delete(ACTIVE_PROFILE_KEY);
  } else {
    await store.set(ACTIVE_PROFILE_KEY, id);
  }
  await store.save();
}

/**
 * Get the active profile
 */
export async function getActiveProfile(): Promise<StoredProfile | null> {
  const activeId = await getActiveProfileId();
  if (!activeId) return null;

  const profile = await getProfile(activeId);
  return profile || null;
}

/**
 * Clear all profiles (use with caution)
 */
export async function clearAllProfiles(): Promise<void> {
  const store = await getStore();
  await store.set(PROFILES_KEY, []);
  await store.delete(ACTIVE_PROFILE_KEY);
  await store.save();
}

/**
 * Export profiles for backup
 */
export async function exportProfiles(): Promise<string> {
  const profiles = await getProfiles();
  return JSON.stringify(profiles, null, 2);
}

/**
 * Import profiles from backup
 */
export async function importProfiles(json: string): Promise<void> {
  const store = await getStore();
  const profiles = JSON.parse(json) as any[];
  await store.set(PROFILES_KEY, profiles.map(normalizeProfile));
  await store.save();
}
