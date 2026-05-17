'use strict';

const path = require('node:path');
const fs = require('node:fs');

const CONTENT_DIR = process.env.FIRE_SAFETY_CONTENT_DIR || 'C:\\Users\\HP\\Desktop\\uk training';

const TEMPLATE_PATHS = [
  path.join(CONTENT_DIR, 'certificate-template.png'),
  path.resolve(__dirname, '../uploads/certificate-template.png'),
  '/app/apps/api/uploads/certificate-template.png',
];

function resolveTemplatePath() {
  return TEMPLATE_PATHS.find((p) => fs.existsSync(p)) || null;
}

function formatDate(value = new Date()) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Returns the metadata model used by CertificateView and generateCertificateImage.
 * All fields are deterministic given the same inputs.
 */
function buildCertificateTemplateModel({ recipientName, issuedAt } = {}) {
  return {
    backgroundImage: resolveTemplatePath(),
    recipientName: recipientName || null,
    issuedDate: formatDate(issuedAt),
    statusText: 'PASS',
    authorizedBy: 'Nargis Nawaz',
    organisation: 'Flexible Health Care One Solution Ltd',
  };
}

module.exports = {
  buildCertificateTemplateModel,
  resolveTemplatePath,
  TEMPLATE_PATHS,
};
