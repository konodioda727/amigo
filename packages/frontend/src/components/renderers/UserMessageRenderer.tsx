import React from 'react';
import { FaSpinner } from 'react-icons/fa';

import { UserSendMessageDisplayType } from "@/messages/types";

const UserMessageRenderer: React.FC<UserSendMessageDisplayType> = ({ message, updateTime, status }) => {
  return (
    <div className="chat chat-end mb-2">
      <div className="chat-bubble bg-primary text-primary-content">
        <div className="min-w-8">{message}</div>
        <div className="text-xs opacity-50">
          {status === "pending" && (
            <FaSpinner className="animate-spin ml-2 inline-block" />
          )}
        </div>
      </div>
      <div className="chat-footer text-xs opacity-50">
        {updateTime && new Date(updateTime).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default UserMessageRenderer;