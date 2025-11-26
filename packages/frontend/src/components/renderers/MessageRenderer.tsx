import React from 'react';
import { Streamdown } from 'streamdown';
import { FrontendCommonMessageType } from '@/messages/types';

const MessageRenderer: React.FC<FrontendCommonMessageType> = ({ message, think, updateTime }) => {
  return (
    <div className="chat chat-start">
      <div className="chat-bubble bg-neutral-100 text-neutral-900 rounded-xl px-4 py-3 shadow-none max-w-[85%] break-words overflow-hidden">
        <Streamdown>{message}</Streamdown>
        {think && (
          <div className="mt-2 pt-2 border-t border-neutral-200 text-sm text-neutral-600">
            <span className="inline-flex items-center gap-1">
              <span className="text-base">💡</span>
              <span>{think}</span>
            </span>
          </div>
        )}
      </div>
      {updateTime && (
        <div className="chat-footer opacity-50">
          {new Date(updateTime).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default MessageRenderer;
