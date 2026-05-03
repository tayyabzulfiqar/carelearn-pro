const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCertificateTemplateModel } = require('./certificate-template');

test('buildCertificateTemplateModel points at the fire safety certificate image and includes pass overlays', () => {
  const model = buildCertificateTemplateModel({
    imageRoot: 'C:/Users/HP/Desktop/uk training',
    user: { first_name: 'Test', last_name: 'User' },
    issuedAt: '2026-05-03T00:00:00.000Z',
  });

  assert.match(model.backgroundImage, /certificate_fire_safety\.png$/);
  assert.equal(model.recipientName, 'Test User');
  assert.equal(model.statusText, 'PASS');
  assert.equal(model.authorizedBy, 'Nargis Nawaz');
});
