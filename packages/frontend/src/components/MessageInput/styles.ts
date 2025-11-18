export const editorStyles = `
  .tiptap-editor-wrapper {
    flex-grow: 1;
  }
  
  .tiptap-editor-wrapper .ProseMirror {
    min-height: 3rem;
    max-height: 12rem;
    overflow-y: auto;
    padding: 0.75rem;
    border-radius: var(--rounded-btn, 0.5rem);
    border-width: 1px;
    border-color: hsl(var(--bc) / 0.2);
    background-color: hsl(var(--b1));
    outline: none;
  }
  
  .tiptap-editor-wrapper .ProseMirror:focus {
    outline: 2px solid hsl(var(--bc) / 0.2);
    outline-offset: 2px;
  }
  
  .tiptap-editor-wrapper .ProseMirror p.is-editor-empty:first-child::before {
    color: hsl(var(--bc) / 0.4);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
  
  .tiptap-editor-wrapper .ProseMirror p {
    margin: 0;
  }
  
  .tiptap-editor-wrapper .ProseMirror .mention {
    background-color: hsl(var(--p) / 0.2);
    border-radius: 0.25rem;
    padding: 0.125rem 0.375rem;
    color: hsl(var(--pc));
    font-weight: 500;
  }

  /* Tippy.js 自定义样式 - 移除默认黑边和箭头 */
  .tippy-box {
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }

  .tippy-content {
    padding: 0 !important;
  }

  .tippy-arrow {
    display: none !important;
  }

  .tippy-box[data-theme~='light-border'] {
    background-color: transparent !important;
    border: none !important;
  }
`;
