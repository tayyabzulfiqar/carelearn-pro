'use client';

import { useState } from 'react';
import { resolveAssetUrl, BLOCK_TYPES } from '@/lib/lesson-blocks';

function RichText({ payload }) {
  return <p className="text-[15px] leading-7 text-stone-700 whitespace-pre-wrap">{payload.text}</p>;
}

function Heading({ payload }) {
  const Tag = payload.level === 1 ? 'h1' : payload.level === 2 ? 'h2' : payload.level === 3 ? 'h3' : 'h4';
  return <Tag className="font-semibold tracking-tight text-stone-900 text-xl">{payload.text}</Tag>;
}

function ImageBlock({ payload }) {
  const [failed, setFailed] = useState(false);
  const src = resolveAssetUrl(payload.src);
  if (!src || failed) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Image unavailable</div>;
  }
  const width = Math.min(100, Math.max(20, Number(payload.width || 100)));
  const alignClass = payload.align === 'left' ? 'mr-auto' : payload.align === 'right' ? 'ml-auto' : 'mx-auto';

  return (
    <figure className={`${alignClass} my-5`} style={{ width: `${width}%` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={payload.alt || ''} className="w-full rounded-lg border border-stone-200 object-cover" loading="lazy" onError={() => setFailed(true)} />
      {payload.caption ? <figcaption className="mt-2 text-xs text-stone-500">{payload.caption}</figcaption> : null}
    </figure>
  );
}

function VideoBlock({ payload }) {
  const [loaded, setLoaded] = useState(false);
  const src = resolveAssetUrl(payload.src);
  if (!src) return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Video unavailable</div>;

  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(src)) {
    return (
      <div className="overflow-hidden rounded-xl border border-stone-200">
        <iframe src={src} title={payload.title || 'Embedded video'} className="h-[320px] w-full" loading="lazy" allowFullScreen />
      </div>
    );
  }

  return (
    <div className="relative">
      {!loaded ? <div className="absolute inset-0 grid place-items-center rounded-xl bg-slate-100 text-xs text-slate-500">Loading video...</div> : null}
      <video controls preload="metadata" className="w-full rounded-xl border border-stone-200" src={src} onLoadedData={() => setLoaded(true)} onError={() => setLoaded(true)}>
        <track kind="captions" />
      </video>
    </div>
  );
}

function FileBlock({ payload }) {
  const href = resolveAssetUrl(payload.href);
  const [pdfFailed, setPdfFailed] = useState(false);
  if (!href) return null;

  const isPdf = payload.fileType === 'pdf' || /\.pdf($|\?)/i.test(href);

  if (isPdf && !pdfFailed) {
    return (
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>
            <span className="text-sm font-medium text-stone-700">{payload.label || 'PDF Document'}</span>
          </div>
          <a href={href} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Open in new tab ↗</a>
        </div>
        <iframe
          src={href + '#toolbar=1&navpanes=0&scrollbar=1'}
          title={payload.label || 'PDF Document'}
          className="w-full"
          style={{ minHeight: '600px', border: 'none' }}
          onError={() => setPdfFailed(true)}
        />
      </div>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors">
      <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      {payload.label || 'Download file'}
    </a>
  );
}

function Divider() {
  return <hr className="my-6 border-stone-200" />;
}

function Callout({ payload }) {
  const toneClass = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
  }[payload.tone] || 'border-blue-200 bg-blue-50 text-blue-900';

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      {payload.title ? <p className="font-semibold">{payload.title}</p> : null}
      {payload.body ? <p className="mt-2 whitespace-pre-wrap text-sm">{payload.body}</p> : null}
    </div>
  );
}

function QuizEmbed({ payload }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">Quiz Block</p>
      <p className="mt-1 text-sm font-medium text-indigo-900">{payload.title || 'Linked quiz'}</p>
      <p className="text-xs text-indigo-700">Quiz ID: {payload.quizId || 'Not linked yet'}</p>
    </div>
  );
}

function Cta({ payload }) {
  const href = resolveAssetUrl(payload.href);
  if (!href) return null;
  const variantClass = payload.variant === 'secondary'
    ? 'bg-white text-stone-800 border border-stone-300'
    : payload.variant === 'ghost'
      ? 'bg-transparent text-navy-800 border border-navy-300'
      : 'bg-navy-800 text-white';

  return <a href={href} className={`inline-flex rounded-lg px-4 py-2 text-sm font-medium ${variantClass}`}>{payload.label || 'Continue'}</a>;
}

function Embed({ payload }) {
  const src = resolveAssetUrl(payload.src);
  if (!src || !/^https?:\/\//i.test(src)) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Embed URL is invalid or unavailable.</div>;
  }
  return <iframe src={src} title={payload.title || 'Embedded content'} className="w-full rounded-xl border border-stone-200" style={{ minHeight: `${payload.height || 360}px` }} loading="lazy" />;
}

// ─── 3-File Block Renderers ─────────────────────────────────────────────────

const POSITION_CLASS_MAP = {
  'full_width':           'cl-image--full-width',
  'centred_medium_width': 'cl-image--centred-medium',
  'full_width_banner':    'cl-image--banner',
  'centred_small':        'cl-image--centred-small',
};

function ratioPct(ratio) {
  if (!ratio) return '56.25';
  const parts = ratio.split(':').map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return '56.25';
  return ((parts[1] / parts[0]) * 100).toFixed(4);
}

function ImageSlotBlock({ payload, isStudioMode = false }) {
  const [imgFailed, setImgFailed] = useState(false);
  const posClass = POSITION_CLASS_MAP[payload.position] || 'cl-image--full-width';
  const frameClass = `cl-frame--${payload.frameStyle || 'none'}`;
  const pct = ratioPct(payload.ratio);

  if (payload.sequentialSetIncomplete && isStudioMode) {
    return (
      <div style={{ border: '2px solid orange', padding: '12px', borderRadius: '4px', background: '#fffbf0', color: '#c70', fontSize: '13px' }}>
        ⚠ Sequential set incomplete: {payload.sequentialSetKey} — All {payload.sequentialSetSize || '?'} images required
      </div>
    );
  }

  if (payload.resolutionStatus === 'unresolved_error') {
    if (!isStudioMode) return null;
    return (
      <div style={{ border: '2px solid red', padding: '12px', borderRadius: '4px', background: '#fff5f5', color: '#c00', fontSize: '13px' }}>
        ⚠ Unmapped image slot: {payload.imageId} — Mapping required
      </div>
    );
  }

  if (payload.resolutionStatus === 'resolved' && payload.cdnUrl && !imgFailed) {
    return (
      <div className={`${posClass} ${frameClass}`} style={{ position: 'relative', paddingBottom: `${pct}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={payload.cdnUrl}
          alt={payload.imageId || ''}
          loading="lazy"
          onError={() => setImgFailed(true)}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  // ASSET_PENDING or resolved but image failed
  return (
    <div className={posClass} style={{ position: 'relative', paddingBottom: `${pct}%`, background: '#f0f0f0', borderRadius: '4px' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '13px' }}>
        {isStudioMode ? `${payload.imageId || 'Image'} — pending upload` : 'Image loading…'}
      </div>
    </div>
  );
}

function KeyInformation({ payload }) {
  return (
    <div className="rounded-xl border-l-4 border-blue-400 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 flex-shrink-0 text-blue-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-sm leading-7 text-blue-900 whitespace-pre-wrap">{payload.text}</p>
      </div>
    </div>
  );
}

function WarningBox({ payload }) {
  return (
    <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 flex-shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        <p className="text-sm leading-7 text-amber-900 whitespace-pre-wrap">{payload.text}</p>
      </div>
    </div>
  );
}

function CriticalInformation({ payload }) {
  return (
    <div className="rounded-xl border-l-4 border-rose-500 bg-rose-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 flex-shrink-0 text-rose-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        <div>
          <p className="font-semibold text-rose-900 text-sm mb-1">Critical Information</p>
          <p className="text-sm leading-7 text-rose-800 whitespace-pre-wrap">{payload.text}</p>
        </div>
      </div>
    </div>
  );
}

function BestPractice({ payload }) {
  return (
    <div className="rounded-xl border-l-4 border-emerald-400 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 flex-shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <p className="font-semibold text-emerald-900 text-sm mb-1">Best Practice</p>
          <p className="text-sm leading-7 text-emerald-800 whitespace-pre-wrap">{payload.text}</p>
        </div>
      </div>
    </div>
  );
}

function ImportantNote({ payload }) {
  return (
    <div className="rounded-xl border-l-4 border-teal-400 bg-teal-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 flex-shrink-0 text-teal-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-sm leading-7 text-teal-900 whitespace-pre-wrap">{payload.text}</p>
      </div>
    </div>
  );
}

function StepList({ payload }) {
  const steps = Array.isArray(payload.steps) && payload.steps.length
    ? payload.steps
    : (payload.text || '').split('\n').map(l => l.replace(/^Step\s*\d+:\s*/i, '').trim()).filter(Boolean);

  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
          <p className="text-[15px] leading-7 text-stone-700 pt-0.5">{step}</p>
        </li>
      ))}
    </ol>
  );
}

function SummaryBlock({ payload }) {
  const lines = (payload.text || '').split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-stone-500 mb-3">Summary</p>
      <ol className="space-y-2">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-stone-300 text-stone-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
            <p className="text-sm leading-6 text-stone-700">{line}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ObjectiveList({ payload }) {
  const items = Array.isArray(payload.objectives) && payload.objectives.length
    ? payload.objectives
    : (payload.text || '').split('\n').map(l => l.trim()).filter(Boolean);

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-stone-500 mb-3">Learning Objectives</p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 text-teal-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            <p className="text-sm leading-6 text-stone-700">{item}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReflectionPrompts({ payload }) {
  const lines = (payload.text || '').split('\n').map(l => l.trim()).filter(Boolean);
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-stone-500">Reflection</p>
      {lines.map((line, i) => (
        <p key={i} className="text-sm leading-7 text-stone-600 italic">{line}</p>
      ))}
    </div>
  );
}

function ReferenceTable({ payload }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-stone-500 mb-2">Reference</p>
      <p className="text-sm leading-7 text-stone-700 whitespace-pre-wrap">{payload.text}</p>
    </div>
  );
}

function QuizPoint({ payload }) {
  const [selected, setSelected] = useState(null);
  const options = Array.isArray(payload.options) ? payload.options : [];

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Quick Check</p>
      <p className="text-[15px] font-semibold text-stone-900">{payload.question}</p>
      <div className="space-y-2">
        {options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = selected !== null && i === Number(payload.correct);
          const isWrong = isSelected && i !== Number(payload.correct);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-all
                ${isCorrect ? 'border-emerald-400 bg-emerald-100 text-emerald-900'
                  : isWrong ? 'border-rose-400 bg-rose-100 text-rose-900'
                  : isSelected ? 'border-amber-500 bg-amber-200 text-amber-900'
                  : 'border-amber-100 bg-white text-stone-700 hover:border-amber-300'}`}
            >
              <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
            </button>
          );
        })}
      </div>
      {selected !== null && payload.rationale && (
        <div className="rounded-lg bg-white border border-amber-200 px-3 py-2 text-xs text-stone-600 italic">
          {selected === Number(payload.correct) ? '✓ Correct! ' : '✗ Incorrect. '}
          {payload.rationale}
        </div>
      )}
    </div>
  );
}

const COMPONENTS = {
  [BLOCK_TYPES.RICH_TEXT]: RichText,
  [BLOCK_TYPES.HEADING]: Heading,
  [BLOCK_TYPES.IMAGE]: ImageBlock,
  [BLOCK_TYPES.VIDEO]: VideoBlock,
  [BLOCK_TYPES.FILE]: FileBlock,
  [BLOCK_TYPES.DIVIDER]: Divider,
  [BLOCK_TYPES.CALLOUT]: Callout,
  [BLOCK_TYPES.QUIZ_EMBED]: QuizEmbed,
  [BLOCK_TYPES.CTA]: Cta,
  [BLOCK_TYPES.EMBED]: Embed,
  // 3-File block types
  image_slot:           ImageSlotBlock,
  key_information:      KeyInformation,
  warning_box:          WarningBox,
  critical_information: CriticalInformation,
  best_practice:        BestPractice,
  important_note:       ImportantNote,
  step_list:            StepList,
  summary:              SummaryBlock,
  objective_list:       ObjectiveList,
  reflection_prompts:   ReflectionPrompts,
  reference_table:      ReferenceTable,
  quiz_point:           QuizPoint,
};

export default function RichLessonRenderer({ blocks = [], isStudioMode = false }) {
  if (!Array.isArray(blocks) || !blocks.length) {
    return <p className="text-sm text-stone-500">No lesson blocks available.</p>;
  }

  return (
    <div className="space-y-5">
      {blocks.map((block) => {
        const Component = COMPONENTS[block.type];
        if (!Component) {
          if (process.env.NODE_ENV === 'development') {
            return (
              <div key={block.id} style={{ border: '1px dashed #ccc', padding: '8px', color: '#666', fontSize: '13px' }}>
                Unknown block type: {block.type}
              </div>
            );
          }
          return null;
        }
        return <Component key={block.id} payload={block.payload || {}} meta={block.meta || {}} isStudioMode={isStudioMode} />;
      })}
    </div>
  );
}
