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
    <div className="flex flex-wrap gap-2 mb-6">
      {questions.map((q) => (
        <button
          key={q.id}
          onClick={() => onSelect(q.query)}
          disabled={disabled}
          className="bg-white border border-brand-200 text-brand-700 px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-brand-50 hover:border-brand-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {q.label}
        </button>
      ))}
    </div>
  );
};

export default SuggestedQuestions;
