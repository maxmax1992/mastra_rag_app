import { FC } from 'react';

interface UserMessageProps {
  content: string;
  timestamp: Date;
}

const UserMessage: FC<UserMessageProps> = ({ content, timestamp }) => {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-blue-600/20 border border-blue-500/30 rounded-lg p-4">
        <div className="text-white">{content}</div>
        <div className="mt-2 text-xs text-gray-500">
          {timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default UserMessage;