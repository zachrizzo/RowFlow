import { invoke } from '@tauri-apps/api/core';
import type { OllamaStatus } from '@/types/ai';
import * as React from 'react';
import { ToastAction } from '@/components/ui/toast';

const EMBEDDING_MODEL = 'nomic-embed-text:latest';
const CHAT_MODEL = 'qwen3:4b';

/**
 * Check if a model is available in the installed models
 * Checks for exact match first, then falls back to base name match for flexibility
 */
export function isModelAvailable(modelName: string, ollamaStatus: OllamaStatus): boolean {
  if (!ollamaStatus.available || !ollamaStatus.models) {
    return false;
  }
  
  // First, try exact match (e.g., "qwen3:4b" should match "qwen3:4b" exactly)
  const exactMatch = ollamaStatus.models.some((m) => m.name === modelName);
  if (exactMatch) {
    return true;
  }
  
  // For models with tags (e.g., "qwen3:4b"), check if base name matches exactly
  // This handles cases where the tag might differ (e.g., "qwen3:4b" vs "qwen3:4b-v1")
  const [baseName, tag] = modelName.split(':');
  if (tag) {
    const tagPrefix = tag.split('-')[0];
    if (tagPrefix) {
      // Check for models that start with the base name and tag
      const baseTagMatch = ollamaStatus.models.some((m) => {
        const [installedBase, installedTag] = m.name.split(':');
        return (
          installedBase === baseName &&
          typeof installedTag === 'string' &&
          installedTag.startsWith(tagPrefix)
        );
      });
      if (baseTagMatch) {
        return true;
      }
    }
  }
  
  // For models without tags or as a last resort, check base name match
  // But only if we're looking for a specific tag (to avoid false positives)
  // This is more lenient for embedding models like "nomic-embed-text:latest"
  if (modelName.includes('embed') || modelName.includes('latest')) {
    const baseNameMatch = ollamaStatus.models.some((m) => {
      const installedBase = m.name.split(':')[0];
      return installedBase === baseName;
    });
    return baseNameMatch;
  }
  
  return false;
}

/**
 * Create a toast action button for opening settings
 */
function createSettingsAction(onOpenSettings?: () => void): React.ReactElement | undefined {
  if (!onOpenSettings) return undefined;
  return React.createElement(ToastAction, {
    altText: 'Open Settings',
    onClick: onOpenSettings,
  }, 'Open Settings');
}

/**
 * Check for missing models and prompt user to install them
 * Returns true if all required models are available, false otherwise
 */
export async function checkAndPromptForMissingModels(
  requiredModels: { type: 'embedding' | 'chat'; model: string },
  toast: (props: { title: string; description: string; variant?: 'default' | 'destructive'; action?: React.ReactElement }) => void,
  onOpenSettings?: () => void
): Promise<boolean> {
  try {
    const ollamaStatus = await invoke<OllamaStatus>('check_ollama_status');
    
    if (!ollamaStatus.available) {
      toast({
        title: 'Ollama Not Running',
        description: 'Please start Ollama in Settings > AI Models to use AI features.',
        variant: 'destructive',
        action: createSettingsAction(onOpenSettings),
      });
      return false;
    }

    const missingModels: string[] = [];
    
    if (requiredModels.type === 'embedding' && !isModelAvailable(requiredModels.model, ollamaStatus)) {
      missingModels.push(`Embedding model: ${requiredModels.model}`);
    }
    
    if (requiredModels.type === 'chat' && !isModelAvailable(requiredModels.model, ollamaStatus)) {
      missingModels.push(`Chat model: ${requiredModels.model}`);
    }

    if (missingModels.length > 0) {
      const modelList = missingModels.join('\n');
      toast({
        title: 'Missing AI Models',
        description: `The following models are required but not installed:\n${modelList}\n\nPlease install them in Settings > AI Models.`,
        variant: 'destructive',
        action: createSettingsAction(onOpenSettings),
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to check Ollama status:', error);
    toast({
      title: 'Failed to Check Models',
      description: 'Could not verify if required AI models are installed.',
      variant: 'destructive',
    });
    return false;
  }
}

/**
 * Check for both embedding and chat models
 */
export async function checkBothModels(
  toast: (props: { title: string; description: string; variant?: 'default' | 'destructive'; action?: React.ReactElement }) => void,
  onOpenSettings?: () => void,
  showToast: boolean = true
): Promise<{ embedding: boolean; chat: boolean }> {
  try {
    const ollamaStatus = await invoke<OllamaStatus>('check_ollama_status');
    
    console.log('[ModelCheck] Ollama status:', ollamaStatus);
    console.log('[ModelCheck] Available models:', ollamaStatus.models?.map(m => m.name));
    
    if (!ollamaStatus.available) {
      if (showToast) {
        toast({
          title: 'Ollama Not Running',
          description: 'Please start Ollama in Settings > AI Models to use AI features.',
          variant: 'destructive',
          action: createSettingsAction(onOpenSettings),
        });
      }
      return { embedding: false, chat: false };
    }

    const embeddingAvailable = isModelAvailable(EMBEDDING_MODEL, ollamaStatus);
    const chatAvailable = isModelAvailable(CHAT_MODEL, ollamaStatus);

    console.log('[ModelCheck] Embedding model available:', embeddingAvailable, `(looking for: ${EMBEDDING_MODEL})`);
    console.log('[ModelCheck] Chat model available:', chatAvailable, `(looking for: ${CHAT_MODEL})`);

    const missingModels: string[] = [];
    if (!embeddingAvailable) {
      missingModels.push(`Embedding model: ${EMBEDDING_MODEL}`);
    }
    if (!chatAvailable) {
      missingModels.push(`Chat model: ${CHAT_MODEL}`);
    }

    if (missingModels.length > 0 && showToast) {
      const modelList = missingModels.join('\n');
      toast({
        title: 'Missing AI Models',
        description: `The following models are required but not installed:\n${modelList}\n\nPlease install them in Settings > AI Models.`,
        variant: 'destructive',
        action: createSettingsAction(onOpenSettings),
      });
    }

    return { embedding: embeddingAvailable, chat: chatAvailable };
  } catch (error) {
    console.error('[ModelCheck] Failed to check Ollama status:', error);
    if (showToast) {
      toast({
        title: 'Failed to Check Models',
        description: 'Could not verify if required AI models are installed.',
        variant: 'destructive',
      });
    }
    return { embedding: false, chat: false };
  }
}

export { EMBEDDING_MODEL, CHAT_MODEL };
