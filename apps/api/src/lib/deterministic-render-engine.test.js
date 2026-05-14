const test = require('node:test');
const assert = require('node:assert/strict');
const { renderCanonicalDeterministic } = require('./deterministic-render-engine');

test('renders canonical deterministically with strict ordering', () => {
  const canonical = {
    title: 'Fire Safety',
    sections: [
      {
        heading: 'Intro',
        blocks: [
          { type: 'paragraph', text: 'Line one.' },
          { type: 'image_marker', key: 'IMAGE_1', align: 'right' },
        ],
      },
      {
        heading: 'Hazards',
        blocks: [{ type: 'paragraph', text: 'Line two.' }],
      },
    ],
  };
  const imageManifest = { IMAGE_1: '/uploads/IMAGE_1.jpg' };
  const first = renderCanonicalDeterministic({ canonical, imageManifest });
  const second = renderCanonicalDeterministic({ canonical, imageManifest });
  assert.deepEqual(first, second);
  assert.equal(first.sections[0].blocks[1].align, 'right');
  assert.ok(first.html.includes('det-align-right'));
});

test('fails loudly when image reference is missing', () => {
  const canonical = {
    title: 'x',
    sections: [{ heading: 'Intro', blocks: [{ type: 'image_marker', key: 'IMAGE_9', align: 'left' }] }],
  };
  assert.throws(() => renderCanonicalDeterministic({ canonical, imageManifest: {} }), /RENDER_IMAGE_REF_MISSING/);
});

test('fails loudly on malformed block', () => {
  const canonical = {
    title: 'x',
    sections: [{ heading: 'Intro', blocks: [{ type: 'unknown', text: 'x' }] }],
  };
  assert.throws(() => renderCanonicalDeterministic({ canonical, imageManifest: {} }), /RENDER_UNSUPPORTED_BLOCK_TYPE/);
});

