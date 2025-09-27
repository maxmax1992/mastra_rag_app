import { FC } from 'react';

interface SystemMessageProps {
  content: string;
  timestamp: Date;
}

const SystemMessage: FC<SystemMessageProps> = ({ content, timestamp }) => {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] bg-purple-600/20 border border-purple-500/30 rounded-lg p-4">
        <div className="text-white">{content}</div>
        <div className="mt-2 text-xs text-gray-500">
          {timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default SystemMessage;