'use client';

import { useMemo, useState } from 'react';
import { BLOCK_TYPES, emptyBlock } from '@/lib/lesson-blocks';

const BLOCK_OPTIONS = [
  { label: 'Rich Text', value: BLOCK_TYPES.RICH_TEXT },
  { label: 'Heading', value: BLOCK_TYPES.HEADING },
  { label: 'Image', value: BLOCK_TYPES.IMAGE },
  { label: 'Video', value: BLOCK_TYPES.VIDEO },
  { label: 'Attachment', value: BLOCK_TYPES.FILE },
  { label: 'Divider', value: BLOCK_TYPES.DIVIDER },
  { label: 'Callout', value: BLOCK_TYPES.CALLOUT },
  { label: 'Quiz Embed', value: BLOCK_TYPES.QUIZ_EMBED },
  { label: 'Button CTA', value: BLOCK_TYPES.CTA },
  { label: 'Iframe Embed', value: BLOCK_TYPES.EMBED },
];

function move(items, from, to) {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function textInput(value, onChange, placeholder = '') {
  return <input className="field-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

export default function LessonBlockEditor({ document, onChange }) {
  const blocks = useMemo(() => document?.blocks || [], [document]);
  const [draggingBlockId, setDraggingBlockId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const [insertType, setInsertType] = useState(BLOCK_TYPES.RICH_TEXT);

  const patchBlock = (id, updater) => {
    const next = blocks.map((block) => (block.id === id ? updater(block) : block));
    onChange({ ...document, blocks: next.map((block, index) => ({ ...block, order: index })) });
  };

  const removeBlock = (id) => {
    const next = blocks.filter((block) => block.id !== id);
    onChange({ ...document, blocks: next.map((block, index) => ({ ...block, order: index })) });
  };

  const duplicateBlock = (id) => {
    const index = blocks.findIndex((block) => block.id === id);
    if (index === -1) return;
    const clone = { ...blocks[index], id: `${blocks[index].id}-copy-${Date.now()}` };
    const next = [...blocks.slice(0, index + 1), clone, ...blocks.slice(index + 1)];
    onChange({ ...document, blocks: next.map((block, idx) => ({ ...block, order: idx })) });
  };

  const appendBlock = (type) => {
    const block = emptyBlock(type);
    block.id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const next = [...blocks, { ...block, order: blocks.length }];
    onChange({ ...document, blocks: next });
  };

  const reorderBlocks = (fromId, toId) => {
    const from = blocks.findIndex((block) => block.id === fromId);
    const to = blocks.findIndex((block) => block.id === toId);
    if (from === -1 || to === -1 || from === to) return;
    onChange({
      ...document,
      blocks: move(blocks, from, to).map((item, idx) => ({ ...item, order: idx })),
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Insert Block</p>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field-input max-w-xs" value={insertType} onChange={(e) => setInsertType(e.target.value)}>
            {BLOCK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" className="btn-primary" onClick={() => appendBlock(insertType)}>Add Block</button>
          <p className="text-xs text-slate-500">Tip: drag by handle to reorder, Ctrl/Cmd+S to save lesson.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {BLOCK_OPTIONS.map((option) => (
          <button key={option.value} type="button" className="btn-secondary" onClick={() => appendBlock(option.value)}>{option.label}</button>
        ))}
      </div>

      <div className="space-y-3">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            draggable
            onDragStart={() => setDraggingBlockId(block.id)}
            onDragOver={(e) => { e.preventDefault(); setDropTargetId(block.id); }}
            onDrop={() => {
              reorderBlocks(draggingBlockId, block.id);
              setDraggingBlockId('');
              setDropTargetId('');
            }}
            onDragEnd={() => { setDraggingBlockId(''); setDropTargetId(''); }}
            className={`rounded-xl border p-3 transition ${draggingBlockId === block.id ? 'border-blue-400 bg-blue-50' : dropTargetId === block.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'} group`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="cursor-grab rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 active:cursor-grabbing">::</span>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{block.type}</p>
              </div>
              <div className="flex gap-1 opacity-80 group-hover:opacity-100">
                <button type="button" className="btn-secondary" onClick={() => onChange({ ...document, blocks: move(blocks, index, index - 1).map((item, idx) => ({ ...item, order: idx })) })}>Up</button>
                <button type="button" className="btn-secondary" onClick={() => onChange({ ...document, blocks: move(blocks, index, index + 1).map((item, idx) => ({ ...item, order: idx })) })}>Down</button>
                <button type="button" className="btn-secondary" onClick={() => duplicateBlock(block.id)}>Duplicate</button>
                <button type="button" className="btn-secondary" onClick={() => removeBlock(block.id)}>Delete</button>
              </div>
            </div>

            {block.type === BLOCK_TYPES.HEADING ? (
              <div className="grid gap-2 md:grid-cols-4">
                {textInput(block.payload?.text, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, text: value } })), 'Heading text')}
                <select className="field-input" value={block.payload?.level || 2} onChange={(e) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, level: Number(e.target.value) } }))}>
                  <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option><option value={4}>H4</option>
                </select>
              </div>
            ) : null}

            {block.type === BLOCK_TYPES.RICH_TEXT ? (
              <textarea className="field-input min-h-[120px]" value={block.payload?.text || ''} onChange={(e) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, text: e.target.value } }))} placeholder="Write lesson content..." />
            ) : null}

            {[BLOCK_TYPES.IMAGE, BLOCK_TYPES.VIDEO, BLOCK_TYPES.EMBED].includes(block.type) ? (
              <div className="grid gap-2 md:grid-cols-3">
                {textInput(block.payload?.src, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, src: value } })), 'Source URL')}
                {textInput(block.payload?.title || block.payload?.alt, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, title: value, alt: value } })), 'Title / Alt')}
                {block.type === BLOCK_TYPES.IMAGE ? (
                  <div className="space-y-1">
                    <input className="field-input" type="number" value={block.payload?.width || 100} onChange={(e) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, width: Number(e.target.value) } }))} placeholder="Width %" />
                    <input type="range" min={25} max={100} value={block.payload?.width || 100} onChange={(e) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, width: Number(e.target.value) } }))} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {block.type === BLOCK_TYPES.FILE ? (
              <div className="grid gap-2 md:grid-cols-2">
                {textInput(block.payload?.href, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, href: value } })), 'File URL')}
                {textInput(block.payload?.label, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, label: value } })), 'Label')}
              </div>
            ) : null}

            {block.type === BLOCK_TYPES.CALLOUT ? (
              <div className="space-y-2">
                <div className="grid gap-2 md:grid-cols-3">
                  {textInput(block.payload?.title, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, title: value } })), 'Callout title')}
                  <select className="field-input" value={block.payload?.tone || 'info'} onChange={(e) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, tone: e.target.value } }))}>
                    <option value="info">Info</option><option value="warning">Warning</option><option value="success">Success</option><option value="danger">Danger</option>
                  </select>
                </div>
                <textarea className="field-input min-h-[90px]" value={block.payload?.body || ''} onChange={(e) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, body: e.target.value } }))} placeholder="Callout body" />
              </div>
            ) : null}

            {block.type === BLOCK_TYPES.QUIZ_EMBED ? (
              <div className="grid gap-2 md:grid-cols-2">
                {textInput(block.payload?.quizId, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, quizId: value } })), 'Quiz ID')}
                {textInput(block.payload?.title, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, title: value } })), 'Quiz title')}
              </div>
            ) : null}

            {block.type === BLOCK_TYPES.CTA ? (
              <div className="grid gap-2 md:grid-cols-3">
                {textInput(block.payload?.label, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, label: value } })), 'Button label')}
                {textInput(block.payload?.href, (value) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, href: value } })), 'Button link')}
                <select className="field-input" value={block.payload?.variant || 'primary'} onChange={(e) => patchBlock(block.id, (current) => ({ ...current, payload: { ...current.payload, variant: e.target.value } }))}>
                  <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="ghost">Ghost</option>
                </select>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
