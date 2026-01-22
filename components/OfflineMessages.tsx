import React from 'react';

interface OfflineMessage {
  key: string;
  tone: 'server' | 'agent';
  text: string;
}

interface OfflineMessagesProps {
  messages: OfflineMessage[];
}

export const OfflineMessages: React.FC<OfflineMessagesProps> = ({ messages }) => {
  if (messages.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {messages.map(message => (
        <div
          key={message.key}
          className={`px-3 py-2 rounded-lg text-sm border ${
            message.tone === 'server'
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
              : 'bg-red-500/10 border-red-500/40 text-red-200'
          }`}
        >
          {message.text}
        </div>
      ))}
    </div>
  );
};
