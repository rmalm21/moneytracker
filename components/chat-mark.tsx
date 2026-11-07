/** The chat button's mark (a speech bubble with a spark), shared by the light button and the chat itself. */
export function ChatMark({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3.2c-4.9 0-8.8 3.4-8.8 7.7 0 2.3 1.1 4.3 2.9 5.7l-.6 3.2c-.1.5.4.9.9.6l3.4-1.8c.7.2 1.4.2 2.2.2 4.9 0 8.8-3.4 8.8-7.7S16.9 3.2 12 3.2Z" fill="currentColor" opacity=".22"/>
    <path d="M12 3.2c-4.9 0-8.8 3.4-8.8 7.7 0 2.3 1.1 4.3 2.9 5.7l-.6 3.2c-.1.5.4.9.9.6l3.4-1.8c.7.2 1.4.2 2.2.2 4.9 0 8.8-3.4 8.8-7.7S16.9 3.2 12 3.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
    <path d="M12 7.4c.3 1.6 1.1 2.4 2.7 2.7-1.6.3-2.4 1.1-2.7 2.7-.3-1.6-1.1-2.4-2.7-2.7 1.6-.3 2.4-1.1 2.7-2.7Z" fill="currentColor"/>
    <circle cx="16.4" cy="13.2" r="1" fill="currentColor"/>
  </svg>;
}
