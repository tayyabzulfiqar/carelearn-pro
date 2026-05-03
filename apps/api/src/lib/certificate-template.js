const path = require('node:path');

function buildCertificateTemplateModel({ imageRoot, user, issuedAt }) {
  const firstName = user?.first_name || '';
  const lastName = user?.last_name || '';
  const issuedDate = new Date(issuedAt || Date.now()).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return {
    backgroundImage: path.join(imageRoot, 'certificate_fire_safety.png'),
    recipientName: `${firstName} ${lastName}`.trim(),
    issuedDate,
    statusText: 'PASS',
    authorizedBy: 'Nargis Nawaz',
    overlays: {
      name: { x: '50%', y: '46%', align: 'center' },
      date: { x: '18%', y: '84%', align: 'left' },
      status: { x: '82%', y: '84%', align: 'right' },
      signature: { x: '74%', y: '78%', align: 'center' },
    },
  };
}

module.exports = {
  buildCertificateTemplateModel,
};
