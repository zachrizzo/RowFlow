import { Store } from '@tauri-apps/plugin-store';
import type { StoredProfile } from '@/types/connection';

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

/**
 * Save a connection profile to the store
 */
export async function saveProfile(profile: StoredProfile): Promise<void> {
  const store = await getStore();
  const profiles = await getProfiles();
  const existingIndex = profiles.findIndex((p) => p.id === profile.id);

  if (existingIndex >= 0) {
    profiles[existingIndex] = profile;
  } else {
    profiles.push(profile);
  }

  await store.set(PROFILES_KEY, profiles);
  await store.save();
}

/**
 * Get all connection profiles from the store
 */
export async function getProfiles(): Promise<StoredProfile[]> {
  const store = await getStore();
  const profiles = await store.get<StoredProfile[]>(PROFILES_KEY);
  return profiles || [];
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
  const profiles = JSON.parse(json) as StoredProfile[];
  await store.set(PROFILES_KEY, profiles);
  await store.save();
}
