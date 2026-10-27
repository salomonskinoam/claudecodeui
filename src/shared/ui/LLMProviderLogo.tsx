import type { LLMProvider } from '@/shared/types';

type LLMProviderLogoProps = {
  provider?: LLMProvider | string | null;
  className?: string;
};

/**
 * Used by the chat, onboarding, project-workspace, settings and sidebar modules to show which coding agent a
 * session or project belongs to. quests: no logos anywhere, to save screen room, so this draws nothing.
 */
export function LLMProviderLogo(_props: LLMProviderLogoProps) {
  return null;
}
