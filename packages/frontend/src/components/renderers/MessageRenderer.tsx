import React from 'react';
import { Streamdown } from 'streamdown';
import { FrontendCommonMessageType } from '@/messages/types';

const MessageRenderer: React.FC<FrontendCommonMessageType> = ({ message, think, updateTime }) => {
  return (
    <div className="chat chat-start mb-2">
      <div className="chat-bubble">
        <Streamdown>{message}</Streamdown>
        {think && (
          <div className="text-xs opacity-70 mt-1">
            💡 <span>{think}</span>
          </div>
        )}
      </div>
      <div className="chat-footer text-xs opacity-50">
        {updateTime && new Date(updateTime).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default MessageRenderer;