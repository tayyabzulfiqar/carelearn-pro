'use client';

import { resolveAssetUrl, BLOCK_TYPES } from '@/lib/lesson-blocks';

function RichText({ payload }) {
  return <p className="text-[15px] leading-7 text-stone-700 whitespace-pre-wrap">{payload.text}</p>;
}

function Heading({ payload }) {
  const Tag = payload.level === 1 ? 'h1' : payload.level === 2 ? 'h2' : payload.level === 3 ? 'h3' : 'h4';
  return <Tag className="font-semibold tracking-tight text-stone-900 text-xl">{payload.text}</Tag>;
}

function ImageBlock({ payload }) {
  const src = resolveAssetUrl(payload.src);
  if (!src) return null;
  const width = Math.min(100, Math.max(20, Number(payload.width || 100)));
  const alignClass = payload.align === 'left' ? 'mr-auto' : payload.align === 'right' ? 'ml-auto' : 'mx-auto';

  return (
    <figure className={`${alignClass} my-5`} style={{ width: `${width}%` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={payload.alt || ''} className="w-full rounded-lg border border-stone-200 object-cover" loading="lazy" />
      {payload.caption ? <figcaption className="mt-2 text-xs text-stone-500">{payload.caption}</figcaption> : null}
    </figure>
  );
}

function VideoBlock({ payload }) {
  const src = resolveAssetUrl(payload.src);
  if (!src) return null;

  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(src)) {
    return (
      <div className="overflow-hidden rounded-xl border border-stone-200">
        <iframe src={src} title={payload.title || 'Embedded video'} className="h-[320px] w-full" loading="lazy" allowFullScreen />
      </div>
    );
  }

  return (
    <video controls preload="metadata" className="w-full rounded-xl border border-stone-200" src={src}>
      <track kind="captions" />
    </video>
  );
}

function FileBlock({ payload }) {
  const href = resolveAssetUrl(payload.href);
  if (!href) return null;
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50">{payload.label || 'Download file'}</a>;
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
  if (!src) return null;
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
