import { useCallback, useEffect, useRef, useState } from 'react';
import type { Menu } from '../../domain/types';
import type { ChatModel } from './assistant';
import { ChatPanel } from './ChatPanel';

interface AssistantLauncherProps {
  menu: Menu;
  /** null when no API key is configured. */
  model: ChatModel | null;
}

/**
 * The sales assistant as a floating panel, opened from a labelled button in the corner.
 * The panel stays mounted while closed, so the conversation survives closing and reopening.
 */
export function AssistantLauncher({ menu, model }: AssistantLauncherProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  // Escape closes the panel wherever focus is (after Ask, the disabled button drops focus to the page).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <div id="assistant-panel" ref={panelRef} className="assistant-panel" hidden={!open}>
        <button type="button" className="assistant-close" aria-label="Close sales assistant" onClick={close}>
          ×
        </button>
        <ChatPanel menu={menu} model={model} />
      </div>

      <button
        ref={buttonRef}
        type="button"
        className="assistant-fab"
        aria-expanded={open}
        aria-controls="assistant-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
          <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
        </svg>
        Sales assistant
        {!model && <span className="assistant-dot" aria-hidden="true" title="API key missing" />}
      </button>
    </>
  );
}
