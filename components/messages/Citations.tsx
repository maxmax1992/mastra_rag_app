import { FC } from 'react';

interface Citation {
  docId: string;
  source?: string;
}

interface CitationsProps {
  citations: Citation[];
}

const Citations: FC<CitationsProps> = ({ citations }) => {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-700">
      <p className="text-xs text-gray-400 mb-2">Sources:</p>
      <div className="space-y-1">
        {citations.map((citation, idx) => (
          <div key={idx} className="text-xs text-gray-500">
            • {citation.source || citation.docId}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Citations;