import React from 'react';
import { SuggestedQuestion } from '../../types';

interface Props {
  questions: SuggestedQuestion[];
  onSelect: (query: string) => void;
  disabled: boolean;
}

const TOP_ROW_IDS = ['sq_001', 'sq_005', 'sq_006', 'sq_007'];
const BOTTOM_ROW_IDS = ['sq_002', 'sq_003', 'sq_004'];

const renderButton = (q: SuggestedQuestion, onSelect: (query: string) => void, disabled: boolean) => {
  if (q.url) {
    return (
      <a
        key={q.id}
        href={q.url}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-full border border-brand-400 bg-white px-3.5 py-1.5 text-[13px] font-medium text-brand-600 hover:bg-brand-50 transition-colors shadow-sm whitespace-nowrap"
      >
        {q.label}
      </a>
    );
  }
  return (
    <button
      key={q.id}
      onClick={() => onSelect(q.query)}
      disabled={disabled}
      className="shrink-0 rounded-full border border-brand-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-brand-600 hover:bg-brand-50 hover:border-brand-400 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {q.label}
    </button>
  );
};

const SuggestedQuestions: React.FC<Props> = ({ questions, onSelect, disabled }) => {
  if (!questions.length) return null;

  const topRow = TOP_ROW_IDS.map((id) => questions.find((q) => q.id === id)).filter(Boolean) as SuggestedQuestion[];
  const bottomRow = BOTTOM_ROW_IDS.map((id) => questions.find((q) => q.id === id)).filter(Boolean) as SuggestedQuestion[];

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex w-max flex-col gap-1.5">
        <div className="flex gap-2">
          {topRow.map((q) => renderButton(q, onSelect, disabled))}
        </div>
        <div className="flex gap-2">
          {bottomRow.map((q) => renderButton(q, onSelect, disabled))}
        </div>
      </div>
    </div>
  );
};

export default SuggestedQuestions;
