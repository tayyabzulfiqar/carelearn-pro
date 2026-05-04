const path = require('node:path');

function buildCertificateTemplateModel({ imageRoot, user, issuedAt, courseTitle }) {
  const issuedDate = new Date(issuedAt || Date.now()).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return {
    backgroundImage: path.join(imageRoot, 'certificate_fire_safety.png'),
    recipientName: `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Unknown',
    courseTitle: courseTitle || 'Fire Safety Awareness',
    issuedDate,
    statusText: 'PASS',
    authorizedBy: 'Nargis Nawaz',
    companyName: 'Flexible Health Care One Solution Ltd',
    directorName: 'Nargis Nawaz',
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
