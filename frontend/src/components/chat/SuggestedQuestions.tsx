import React from 'react';
import { SuggestedQuestion } from '../../types';

interface Props {
  questions: SuggestedQuestion[];
  onSelect: (query: string) => void;
  disabled: boolean;
}

const SuggestedQuestions: React.FC<Props> = ({ questions, onSelect, disabled }) => {
  if (!questions.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
      {questions.map((q) =>
        q.url ? (
          <a
            key={q.id}
            href={q.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-brand-400 bg-white px-3.5 py-1.5 text-[13px] font-medium text-brand-600 hover:bg-brand-50 transition-colors shadow-sm"
          >
            {q.label}
          </a>
        ) : (
          <button
            key={q.id}
            onClick={() => onSelect(q.query)}
            disabled={disabled}
            className="shrink-0 rounded-full border border-brand-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-brand-600 hover:bg-brand-50 hover:border-brand-400 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {q.label}
          </button>
        ),
      )}
    </div>
  );
};

export default SuggestedQuestions;
