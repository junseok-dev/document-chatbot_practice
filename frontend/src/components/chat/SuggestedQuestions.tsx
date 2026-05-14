import React from 'react';
import { SuggestedQuestion } from '../../types';

interface Props {
  questions: SuggestedQuestion[];
  onSelect: (query: string) => void;
  disabled: boolean;
}

const SuggestedQuestions: React.FC<Props> = ({ questions, onSelect, disabled }) => {
  if (!questions.length) return null;

  const btnClass =
    'w-full bg-white border border-brand-200 text-brand-700 px-2 py-1.5 rounded-full text-[12px] font-medium hover:bg-brand-50 hover:border-brand-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-center truncate';

  const urlBtnClass =
    'w-full bg-amber-500 border border-amber-500 text-white px-2 py-1.5 rounded-full text-[12px] font-medium hover:bg-amber-600 transition-all shadow-sm text-center truncate';

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {questions.map((q) =>
        q.url ? (
          <a key={q.id} href={q.url} target="_blank" rel="noreferrer" className={urlBtnClass}>
            {q.label}
          </a>
        ) : (
          <button
            key={q.id}
            onClick={() => onSelect(q.query)}
            disabled={disabled}
            className={btnClass}
          >
            {q.label}
          </button>
        ),
      )}
    </div>
  );
};

export default SuggestedQuestions;
