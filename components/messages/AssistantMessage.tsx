import { FC } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText } from 'lucide-react';
import Citations from './Citations';

interface Citation {
  docId: string;
  source?: string;
}

interface Context {
  docId: string;
  classification: string;
  score: number;
}

interface AssistantMessageProps {
  content: string;
  citations?: Citation[];
  contexts?: Context[];
  timestamp: Date;
}

const AssistantMessage: FC<AssistantMessageProps> = ({
  content,
  citations,
  contexts,
  timestamp
}) => {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        {contexts && contexts.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {contexts.map((ctx, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center text-xs px-2 py-1 rounded-full border
                  ${ctx.classification === 'confidential' ? 'security-badge-confidential' :
                    ctx.classification === 'internal' ? 'security-badge-internal' :
                    'security-badge-public'}`}
              >
                <FileText className="h-3 w-3 mr-1" />
                {ctx.docId}
              </span>
            ))}
          </div>
        )}

        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>

        <Citations citations={citations || []} />

        <div className="mt-2 text-xs text-gray-500">
          {timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default AssistantMessage;