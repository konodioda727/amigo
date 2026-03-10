export const messageInputEditorStyles = `
  .message-input-container {
    width: 100%;
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 16px 24px 12px;
    background: transparent;
    z-index: 10;
  }

  .tiptap-editor-wrapper {
    position: relative;
    max-width: 800px;
    margin: 0 auto;
  }

  .tiptap-editor-wrapper .ProseMirror {
    min-height: 60px;
    max-height: 320px;
    overflow-y: auto;
    padding: 18px 64px 18px 60px;
    border-radius: 30px;
    border: 1px solid #e5e7eb;
    background-color: #ffffff;
    box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.05);
    font-size: 15px;
    font-weight: 400;
    line-height: 1.5;
    transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
    outline: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .tiptap-editor-wrapper .ProseMirror:focus {
    border-color: #d1d5db;
    box-shadow: 0 4px 25px -5px rgba(0, 0, 0, 0.08);
    outline: none;
  }

  .attachment-button-wrapper {
    position: absolute;
    left: 10px;
    bottom: 10px;
    z-index: 10;
  }

  .send-button-wrapper {
    position: absolute;
    right: 10px;
    bottom: 10px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tiptap-editor-wrapper .ProseMirror p.is-editor-empty:first-child::before {
    color: #9ca3af;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }

  .tiptap-editor-wrapper .ProseMirror p {
    margin: 0;
  }

  .mention-suggestions {
    min-width: 200px;
  }

  .attachment-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }

  .attachment-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    min-width: 0;
    max-width: 100%;
  }

  .attachment-chip-main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    color: inherit;
  }

  .attachment-chip-main.is-clickable {
    cursor: pointer;
  }

  .attachment-thumb {
    width: 22px;
    height: 22px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .attachment-thumb-wrap {
    position: relative;
    display: inline-flex;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .attachment-thumb-overlay {
    position: absolute;
    inset: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 6px;
    background: rgba(17, 24, 39, 0.55);
    color: #fff;
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
  }

  .attachment-thumb-overlay.is-error {
    background: rgba(185, 28, 28, 0.78);
  }

  .attachment-chip-name {
    font-size: 12px;
    color: #111827;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-chip-size {
    font-size: 11px;
    color: #6b7280;
    flex-shrink: 0;
  }

  .attachment-chip-status {
    font-size: 11px;
    color: #6b7280;
    background: #f3f4f6;
    border-radius: 9999px;
    padding: 2px 6px;
    flex-shrink: 0;
  }

  .attachment-chip-status.is-success {
    color: #065f46;
    background: #d1fae5;
  }

  .attachment-chip-status.is-error {
    color: #991b1b;
    background: #fee2e2;
  }

  .attachment-chip-error {
    max-width: 180px;
    font-size: 11px;
    color: #b91c1c;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
  }

  .attachment-chip-remove:hover {
    color: #111827;
  }
`;
