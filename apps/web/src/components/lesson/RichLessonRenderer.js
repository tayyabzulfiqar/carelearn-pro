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
};

export default function RichLessonRenderer({ blocks = [] }) {
  if (!Array.isArray(blocks) || !blocks.length) {
    return <p className="text-sm text-stone-500">No lesson blocks available.</p>;
  }

  return (
    <div className="space-y-5">
      {blocks.map((block) => {
        const Component = COMPONENTS[block.type] || RichText;
        return <Component key={block.id} payload={block.payload || {}} meta={block.meta || {}} />;
      })}
    </div>
  );
}
