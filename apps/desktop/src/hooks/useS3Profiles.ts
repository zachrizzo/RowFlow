import { useState, useEffect, useCallback } from 'react';
import type { StoredS3Profile } from '@/types/s3';

const S3_PROFILES_KEY = 'rowflow-s3-profiles';

export function useS3Profiles() {
  const [profiles, setProfiles] = useState<StoredS3Profile[]>([]);

  // Load profiles from localStorage
  const loadProfiles = useCallback(() => {
    try {
      const stored = localStorage.getItem(S3_PROFILES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setProfiles(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.error('Failed to load S3 profiles:', error);
      setProfiles([]);
    }
  }, []);

  // Save profile
  const saveProfile = useCallback((profile: Omit<StoredS3Profile, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newProfile: StoredS3Profile = {
      ...profile,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setProfiles((prev) => {
      const updated = [...prev, newProfile];
      localStorage.setItem(S3_PROFILES_KEY, JSON.stringify(updated));
      return updated;
    });

    return newProfile;
  }, []);

  // Update profile
  const updateProfile = useCallback((profileId: string, updates: Partial<Omit<StoredS3Profile, 'id' | 'createdAt' | 'updatedAt'>>) => {
    setProfiles((prev) => {
      const updated = prev.map((p) =>
        p.id === profileId
          ? { ...p, ...updates, updatedAt: Date.now() }
          : p
      );
      localStorage.setItem(S3_PROFILES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Delete profile
  const deleteProfile = useCallback((profileId: string) => {
    setProfiles((prev) => {
      const updated = prev.filter((p) => p.id !== profileId);
      localStorage.setItem(S3_PROFILES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Get profile by ID
  const getProfile = useCallback((profileId: string) => {
    return profiles.find((p) => p.id === profileId);
  }, [profiles]);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  return {
    profiles,
    saveProfile,
    updateProfile,
    deleteProfile,
    getProfile,
    refreshProfiles: loadProfiles,
  };
}
