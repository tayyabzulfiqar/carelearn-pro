'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildCertificateTemplateModel, TEMPLATE_PATHS } = require('./certificate-template');

describe('buildCertificateTemplateModel', () => {
  it('returns statusText = PASS', () => {
    const model = buildCertificateTemplateModel({ recipientName: 'Jane Doe', issuedAt: new Date('2026-01-15') });
    assert.equal(model.statusText, 'PASS');
  });

  it('returns authorizedBy = Nargis Nawaz', () => {
    const model = buildCertificateTemplateModel({});
    assert.equal(model.authorizedBy, 'Nargis Nawaz');
  });

  it('formats issuedDate in en-GB format', () => {
    const model = buildCertificateTemplateModel({ issuedAt: new Date('2026-01-15') });
    assert.ok(model.issuedDate.includes('2026'), `Date should include year: ${model.issuedDate}`);
    assert.ok(model.issuedDate.includes('January'), `Date should include month: ${model.issuedDate}`);
    assert.ok(model.issuedDate.includes('15'), `Date should include day: ${model.issuedDate}`);
  });

  it('uses current date when issuedAt is omitted', () => {
    const before = new Date();
    const model = buildCertificateTemplateModel({ recipientName: 'Test' });
    const after = new Date();
    assert.ok(typeof model.issuedDate === 'string' && model.issuedDate.length > 0);
    // Should include current year
    assert.ok(model.issuedDate.includes(String(before.getFullYear())));
  });

  it('sets recipientName from input', () => {
    const model = buildCertificateTemplateModel({ recipientName: 'Alice Smith' });
    assert.equal(model.recipientName, 'Alice Smith');
  });

  it('sets recipientName to null when omitted', () => {
    const model = buildCertificateTemplateModel({});
    assert.equal(model.recipientName, null);
  });

  it('returns organisation field', () => {
    const model = buildCertificateTemplateModel({});
    assert.ok(model.organisation && model.organisation.length > 0);
  });

  it('backgroundImage is either a valid string path or null', () => {
    const model = buildCertificateTemplateModel({});
    assert.ok(model.backgroundImage === null || typeof model.backgroundImage === 'string');
  });

  it('is deterministic — same inputs produce same output', () => {
    const a = buildCertificateTemplateModel({ recipientName: 'Bob', issuedAt: new Date('2026-03-01') });
    const b = buildCertificateTemplateModel({ recipientName: 'Bob', issuedAt: new Date('2026-03-01') });
    assert.deepEqual(a, b);
  });
});

describe('TEMPLATE_PATHS', () => {
  it('is an array of strings', () => {
    assert.ok(Array.isArray(TEMPLATE_PATHS));
    for (const p of TEMPLATE_PATHS) {
      assert.equal(typeof p, 'string');
    }
  });

  it('includes at least one path', () => {
    assert.ok(TEMPLATE_PATHS.length >= 1);
  });
});
