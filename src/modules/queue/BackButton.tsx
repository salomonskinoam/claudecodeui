import { goBack, useCanGoBack } from '@/modules/queue/queueNavigation';

/**
 * quests priority queue: "Back", the undo of "Next", beside every "Next" a chat shows (the input box, and the
 * banner of a chat open in another editor). Enabled only on a chat that "Next" opened.
 */
export default function BackButton({ className }: { className: string }) {
  const canGoBack = useCanGoBack();
  return (
    <button
      type="button"
      data-quests-back="button"
      title={canGoBack ? 'Back to the chat you left with Next; this chat is marked as it was before' : 'Back works after Next'}
      disabled={!canGoBack}
      className={`${className} ${canGoBack ? 'hover:bg-[#2a2d2e]' : 'opacity-40'}`}
      onClick={() => goBack()}
    >
      Back
    </button>
  );
}
