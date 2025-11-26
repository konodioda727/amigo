export const editorStyles = `
  .message-input-container {
    width: 100%;
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 32px 24px;
    background: #fafafa;
    z-index: 10;
  }

  .tiptap-editor-wrapper {
    position: relative;
    max-width: 800px;
    margin: 0 auto;
  }
  
  .tiptap-editor-wrapper .ProseMirror {
    /* 最小高度 */
    min-height: 80px;
    max-height: 240px;
    overflow-y: auto;
    
    /* 内边距 - 右侧留出按钮空间 */
    padding: 16px 60px 16px 20px;
    
    /* 圆角 16px (Requirements 3.1) */
    border-radius: 16px;
    
    /* 边框 */
    border: 1px solid #e5e5e5;
    
    /* 背景色 */
    background-color: #ffffff;
    
    /* 阴影效果 (Requirements 3.2) */
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.08);
    
    /* 字体大小 */
    font-size: 15px;
    line-height: 1.6;
    
    /* 过渡动画效果 (Requirements 3.3) */
    transition: border-color 200ms ease-in-out, box-shadow 200ms ease-in-out;
    
    outline: none;
  }

  /* 自定义滚动条样式 */
  .tiptap-editor-wrapper .ProseMirror::-webkit-scrollbar {
    width: 6px;
  }

  .tiptap-editor-wrapper .ProseMirror::-webkit-scrollbar-track {
    background: transparent;
  }

  .tiptap-editor-wrapper .ProseMirror::-webkit-scrollbar-thumb {
    background: #d4d4d4;
    border-radius: 3px;
  }

  .tiptap-editor-wrapper .ProseMirror::-webkit-scrollbar-thumb:hover {
    background: #a3a3a3;
  }
  
  /* 聚焦状态视觉反馈 (Requirements 3.3) */
  .tiptap-editor-wrapper .ProseMirror:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgb(59 130 246 / 0.1);
    outline: none;
  }

  /* 发送按钮定位在输入框内部右下角 */
  .send-button-wrapper {
    position: absolute;
    right: 10px;
    bottom: 10px;
    z-index: 10;
  }
  
  .tiptap-editor-wrapper .ProseMirror p.is-editor-empty:first-child::before {
    color: var(--color-neutral-400, #a3a3a3);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }
  
  .tiptap-editor-wrapper .ProseMirror p {
    margin: 0;
  }
  
  .tiptap-editor-wrapper .ProseMirror .mention {
    background-color: var(--color-primary-light, #dbeafe);
    border-radius: var(--radius-sm, 0.375rem);
    padding: 0.125rem 0.375rem;
    color: var(--color-primary, #3b82f6);
    font-weight: var(--font-weight-medium, 500);
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
