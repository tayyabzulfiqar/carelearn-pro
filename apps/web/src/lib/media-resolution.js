function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || '/api/v1';
}

function getApiOrigin() {
  const apiBase = getApiBase();
  return apiBase ? apiBase.replace(/\/api\/v1\/?$/, '') : '';
}

function resolveMediaAssetUrl(input = '') {
  const apiBase = getApiBase();
  const apiOrigin = getApiOrigin();

  if (!input || typeof input !== 'string') return '';
  if (input.startsWith('http://') || input.startsWith('https://')) return input;
  if (input.startsWith('/certificates')) return `${apiOrigin}${input}`;
  if (input.startsWith('/api/v1')) return `${apiBase}${input.replace(/^\/api\/v1/, '')}`;
  if (input.startsWith('/uploads')) return `${apiOrigin}${input}`;
  if (input.startsWith('/bls/')) return input;
  if (input.startsWith('/course-assets/')) return input;
  return `${apiBase}${input.startsWith('/') ? input : `/${input}`}`;
}

module.exports = {
  getApiBase,
  getApiOrigin,
  resolveMediaAssetUrl,
};
