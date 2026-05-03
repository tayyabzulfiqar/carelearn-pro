const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = 'C:/Users/HP/Desktop/uk training';
const JSON_PATH = path.join(ROOT, 'fire-safety-course.json');

const COLORS = {
  ink: '#162235',
  navy: '#24384f',
  navySoft: '#39506b',
  cream: '#f4efe6',
  sand: '#eadfcf',
  gold: '#c18a2c',
  ember: '#d85a32',
  smoke: '#6a7788',
  mint: '#dbe7df',
  teal: '#3d7a7a',
  green: '#5c8f52',
  red: '#c54a39',
  white: '#ffffff',
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrapSvg(width, height, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bgWarm" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${COLORS.cream}"/>
        <stop offset="100%" stop-color="${COLORS.sand}"/>
      </linearGradient>
      <linearGradient id="bgCool" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f4f8fb"/>
        <stop offset="100%" stop-color="#d7e5ef"/>
      </linearGradient>
      <linearGradient id="fireGlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffcc62"/>
        <stop offset="100%" stop-color="${COLORS.ember}"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.12"/>
      </filter>
    </defs>
    ${body}
  </svg>`;
}

function splitLines(text, maxLen = 26) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function multilineText(lines, x, y, size, color, weight = 700, lineHeight = size + 8) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + (index * lineHeight)}" fill="${color}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`
  )).join('');
}

function classify(file, heading) {
  const h = `${file} ${heading}`.toLowerCase();
  if (h.includes('triangle')) return { category: 'diagram', variant: 'triangle', width: 500, height: 400 };
  if (h.includes('spread')) return { category: 'diagram', variant: 'spread', width: 500, height: 400 };
  if (h.includes('door') || h.includes('compartment')) return { category: 'diagram', variant: 'compartment', width: 500, height: 400 };
  if (h.includes('sign')) return { category: 'icon', variant: 'signs', width: 300, height: 300 };
  if (h.includes('detector') || h.includes('call points') || h.includes('panel')) return { category: 'icon', variant: 'detection', width: 300, height: 300 };
  if (h.includes('extinguisher') || h.includes('pass method')) return { category: 'diagram', variant: 'extinguisher', width: 500, height: 400 };
  if (h.includes('blanket')) return { category: 'diagram', variant: 'blanket', width: 500, height: 400 };
  if (h.includes('response') || h.includes('handover')) return { category: 'diagram', variant: 'response', width: 500, height: 400 };
  if (h.includes('peep') || h.includes('mobility')) return { category: 'diagram', variant: 'peep', width: 500, height: 400 };
  if (h.includes('evacuation')) return { category: 'diagram', variant: 'evacuation', width: 500, height: 400 };
  if (h.includes('reference') || h.includes('source materials')) return { category: 'diagram', variant: 'references', width: 500, height: 400 };
  if (h.includes('smoke') || h.includes('fire')) return { category: 'scene', variant: 'emergency', width: 800, height: 500 };
  if (h.includes('resident') || h.includes('staff') || h.includes('reflection') || h.includes('training') || h.includes('care')) {
    return { category: 'scene', variant: 'care', width: 600, height: 400 };
  }
  return { category: 'scene', variant: 'care', width: 600, height: 400 };
}

function drawHeader(width, heading, subLabel) {
  return `
    <rect x="0" y="0" width="${width}" height="68" fill="${COLORS.navy}"/>
    <text x="28" y="28" fill="#d8e2ec" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2">CARELEARN FIRE SAFETY</text>
    <text x="28" y="52" fill="${COLORS.white}" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700">${escapeXml(heading)}</text>
    <rect x="${width - 148}" y="18" rx="18" ry="18" width="120" height="30" fill="${COLORS.gold}" opacity="0.95"/>
    <text x="${width - 88}" y="38" text-anchor="middle" fill="${COLORS.white}" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(subLabel)}</text>
  `;
}

function drawScene(meta) {
  const { width, height, heading } = meta;
  const lines = splitLines(heading, 24);
  const roomTop = 96;
  const floorY = height - 72;
  const isEmergency = meta.variant === 'emergency';
  const backdrop = isEmergency ? 'url(#bgCool)' : 'url(#bgWarm)';
  const accent = isEmergency ? COLORS.red : COLORS.teal;

  return wrapSvg(width, height, `
    <rect width="${width}" height="${height}" fill="${backdrop}"/>
    ${drawHeader(width, heading, isEmergency ? 'LIVE SCENE' : 'CARE PRACTICE')}
    <rect x="32" y="108" width="${Math.round(width * 0.36)}" height="${height - 156}" rx="28" fill="${COLORS.white}" filter="url(#shadow)"/>
    ${multilineText(lines, 56, 154, 26, COLORS.ink)}
    <text x="56" y="${isEmergency ? 260 : 248}" fill="${COLORS.smoke}" font-family="Segoe UI, Arial, sans-serif" font-size="15">Fire awareness for residential care teams</text>
    <rect x="56" y="${isEmergency ? 284 : 272}" width="120" height="30" rx="15" fill="${COLORS.sand}"/>
    <text x="116" y="${isEmergency ? 304 : 292}" text-anchor="middle" fill="${COLORS.navy}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">observe</text>
    <rect x="184" y="${isEmergency ? 284 : 272}" width="120" height="30" rx="15" fill="${COLORS.sand}"/>
    <text x="244" y="${isEmergency ? 304 : 292}" text-anchor="middle" fill="${COLORS.navy}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">respond</text>
    <rect x="56" y="${isEmergency ? 324 : 312}" width="248" height="84" rx="18" fill="#f7f4ee"/>
    <text x="76" y="${isEmergency ? 352 : 340}" fill="${accent}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">Training image</text>
    <text x="76" y="${isEmergency ? 378 : 366}" fill="${COLORS.smoke}" font-family="Segoe UI, Arial, sans-serif" font-size="14">Keep pathways visible</text>
    <text x="76" y="${isEmergency ? 400 : 388}" fill="${COLORS.smoke}" font-family="Segoe UI, Arial, sans-serif" font-size="14">Protect residents and staff</text>

    <rect x="${Math.round(width * 0.46)}" y="${roomTop}" width="${Math.round(width * 0.46)}" height="${height - 176}" rx="34" fill="${COLORS.white}" filter="url(#shadow)"/>
    <rect x="${Math.round(width * 0.5)}" y="${roomTop + 42}" width="${Math.round(width * 0.38)}" height="${height - 220}" rx="26" fill="#ecf1f5"/>
    <rect x="${Math.round(width * 0.52)}" y="${floorY - 68}" width="${Math.round(width * 0.34)}" height="72" fill="#d9cfbd"/>
    <rect x="${Math.round(width * 0.56)}" y="${roomTop + 78}" width="92" height="138" rx="10" fill="${COLORS.navySoft}"/>
    <rect x="${Math.round(width * 0.575)}" y="${roomTop + 96}" width="58" height="78" rx="6" fill="#9cb0c1"/>
    <circle cx="${Math.round(width * 0.76)}" cy="${roomTop + 88}" r="28" fill="${COLORS.navySoft}"/>
    <rect x="${Math.round(width * 0.73)}" y="${roomTop + 116}" width="56" height="110" rx="26" fill="${accent}"/>
    <rect x="${Math.round(width * 0.69)}" y="${roomTop + 132}" width="18" height="70" rx="8" fill="${accent}"/>
    <rect x="${Math.round(width * 0.80)}" y="${roomTop + 132}" width="18" height="70" rx="8" fill="${accent}"/>
    <rect x="${Math.round(width * 0.73)}" y="${roomTop + 214}" width="18" height="74" rx="8" fill="${COLORS.navySoft}"/>
    <rect x="${Math.round(width * 0.77)}" y="${roomTop + 214}" width="18" height="74" rx="8" fill="${COLORS.navySoft}"/>
    <circle cx="${Math.round(width * 0.66)}" cy="${roomTop + 110}" r="20" fill="${COLORS.teal}"/>
    <rect x="${Math.round(width * 0.64)}" y="${roomTop + 130}" width="42" height="90" rx="18" fill="${COLORS.teal}"/>
    <rect x="${Math.round(width * 0.61)}" y="${roomTop + 148}" width="16" height="62" rx="8" fill="${COLORS.teal}"/>
    <rect x="${Math.round(width * 0.70)}" y="${roomTop + 148}" width="16" height="62" rx="8" fill="${COLORS.teal}"/>
    <rect x="${Math.round(width * 0.64)}" y="${roomTop + 214}" width="14" height="68" rx="7" fill="${COLORS.navySoft}"/>
    <rect x="${Math.round(width * 0.67)}" y="${roomTop + 214}" width="14" height="68" rx="7" fill="${COLORS.navySoft}"/>

    ${isEmergency ? `
      <path d="M${Math.round(width * 0.88)} ${roomTop + 164} C ${Math.round(width * 0.92)} ${roomTop + 124}, ${Math.round(width * 0.94)} ${roomTop + 186}, ${Math.round(width * 0.9)} ${roomTop + 206} C ${Math.round(width * 0.95)} ${roomTop + 208}, ${Math.round(width * 0.97)} ${roomTop + 254}, ${Math.round(width * 0.91)} ${roomTop + 268} C ${Math.round(width * 0.87)} ${roomTop + 252}, ${Math.round(width * 0.84)} ${roomTop + 228}, ${Math.round(width * 0.88)} ${roomTop + 164} Z" fill="url(#fireGlow)"/>
      <path d="M${Math.round(width * 0.87)} ${roomTop + 118} C ${Math.round(width * 0.82)} ${roomTop + 92}, ${Math.round(width * 0.82)} ${roomTop + 66}, ${Math.round(width * 0.88)} ${roomTop + 44} C ${Math.round(width * 0.94)} ${roomTop + 66}, ${Math.round(width * 0.95)} ${roomTop + 98}, ${Math.round(width * 0.91)} ${roomTop + 126} Z" fill="#cfd7df" opacity="0.9"/>
      <path d="M${Math.round(width * 0.92)} ${roomTop + 126} C ${Math.round(width * 0.88)} ${roomTop + 98}, ${Math.round(width * 0.9)} ${roomTop + 78}, ${Math.round(width * 0.95)} ${roomTop + 58} C ${width} ${roomTop + 84}, ${width} ${roomTop + 122}, ${Math.round(width * 0.97)} ${roomTop + 146} Z" fill="#bfc9d3" opacity="0.8"/>
      <circle cx="${Math.round(width * 0.59)}" cy="${roomTop + 66}" r="18" fill="#ffffff"/>
      <circle cx="${Math.round(width * 0.59)}" cy="${roomTop + 66}" r="9" fill="${COLORS.red}"/>
      <rect x="${Math.round(width * 0.565)}" y="${roomTop + 90}" width="50" height="12" rx="6" fill="${COLORS.red}" opacity="0.2"/>
    ` : `
      <rect x="${Math.round(width * 0.84)}" y="${roomTop + 90}" width="46" height="98" rx="10" fill="${COLORS.gold}"/>
      <rect x="${Math.round(width * 0.855)}" y="${roomTop + 104}" width="16" height="50" rx="8" fill="${COLORS.white}"/>
      <rect x="${Math.round(width * 0.82)}" y="${roomTop + 216}" width="80" height="54" rx="14" fill="${COLORS.mint}"/>
      <rect x="${Math.round(width * 0.83)}" y="${roomTop + 230}" width="22" height="22" rx="6" fill="${COLORS.green}"/>
      <path d="M${Math.round(width * 0.865)} ${roomTop + 240} l8 8 l16 -18" stroke="${COLORS.white}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    `}
  `);
}

function drawDiagram(meta) {
  const { width, height, heading, variant } = meta;
  const lines = splitLines(heading, 30);

  const common = `
    <rect width="${width}" height="${height}" fill="url(#bgWarm)"/>
    ${drawHeader(width, heading, 'TRAINING DIAGRAM')}
    <rect x="24" y="92" width="${width - 48}" height="${height - 116}" rx="28" fill="${COLORS.white}" filter="url(#shadow)"/>
    ${multilineText(lines, 48, 132, 20, COLORS.ink, 700, 24)}
  `;

  if (variant === 'triangle') {
    return wrapSvg(width, height, `
      ${common}
      <polygon points="250,172 162,320 338,320" fill="#fff6e9" stroke="${COLORS.gold}" stroke-width="8"/>
      <circle cx="250" cy="168" r="28" fill="${COLORS.ember}"/>
      <text x="250" y="175" text-anchor="middle" fill="${COLORS.white}" font-size="14" font-family="Segoe UI" font-weight="700">HEAT</text>
      <circle cx="154" cy="326" r="28" fill="${COLORS.green}"/>
      <text x="154" y="333" text-anchor="middle" fill="${COLORS.white}" font-size="14" font-family="Segoe UI" font-weight="700">FUEL</text>
      <circle cx="346" cy="326" r="28" fill="${COLORS.teal}"/>
      <text x="346" y="333" text-anchor="middle" fill="${COLORS.white}" font-size="12" font-family="Segoe UI" font-weight="700">OXYGEN</text>
      <rect x="56" y="206" width="72" height="68" rx="18" fill="#f7efe2"/><text x="92" y="247" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">remove</text>
      <rect x="372" y="206" width="72" height="68" rx="18" fill="#edf4f5"/><text x="408" y="247" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">control</text>
    `);
  }

  if (variant === 'spread') {
    return wrapSvg(width, height, `
      ${common}
      <circle cx="250" cy="242" r="42" fill="url(#fireGlow)"/>
      <path d="M250 188 L250 150" stroke="${COLORS.red}" stroke-width="10" stroke-linecap="round"/>
      <path d="M208 260 L132 292" stroke="${COLORS.gold}" stroke-width="10" stroke-linecap="round"/>
      <path d="M292 260 L368 292" stroke="${COLORS.ember}" stroke-width="10" stroke-linecap="round"/>
      <rect x="196" y="110" width="108" height="40" rx="20" fill="#efe6d5"/><text x="250" y="136" text-anchor="middle" fill="${COLORS.navy}" font-size="14" font-family="Segoe UI" font-weight="700">convection</text>
      <rect x="62" y="292" width="126" height="42" rx="21" fill="#f8efe3"/><text x="125" y="319" text-anchor="middle" fill="${COLORS.navy}" font-size="14" font-family="Segoe UI" font-weight="700">conduction</text>
      <rect x="312" y="292" width="126" height="42" rx="21" fill="#f6e7de"/><text x="375" y="319" text-anchor="middle" fill="${COLORS.navy}" font-size="14" font-family="Segoe UI" font-weight="700">radiation</text>
    `);
  }

  if (variant === 'compartment') {
    return wrapSvg(width, height, `
      ${common}
      <rect x="82" y="164" width="136" height="136" rx="16" fill="#eef3f6" stroke="${COLORS.navySoft}" stroke-width="4"/>
      <rect x="282" y="164" width="136" height="136" rx="16" fill="#eef3f6" stroke="${COLORS.navySoft}" stroke-width="4"/>
      <rect x="222" y="182" width="56" height="104" rx="8" fill="${COLORS.navy}" />
      <rect x="236" y="200" width="28" height="64" rx="4" fill="#96abc0" />
      <path d="M148 226 l36 0" stroke="${COLORS.red}" stroke-width="8" stroke-linecap="round"/>
      <path d="M316 226 l-36 0" stroke="${COLORS.green}" stroke-width="8" stroke-linecap="round"/>
      <text x="150" y="320" text-anchor="middle" fill="${COLORS.navy}" font-size="15" font-family="Segoe UI" font-weight="700">fire room</text>
      <text x="350" y="320" text-anchor="middle" fill="${COLORS.navy}" font-size="15" font-family="Segoe UI" font-weight="700">safe compartment</text>
    `);
  }

  if (variant === 'response') {
    const steps = ['Raise alarm', 'Call 999', 'Contain', 'Evacuate', 'Handover'];
    return wrapSvg(width, height, `
      ${common}
      ${steps.map((step, index) => {
        const x = 56 + (index * 86);
        const fill = index % 2 === 0 ? COLORS.navy : COLORS.gold;
        return `
          <circle cx="${x + 34}" cy="258" r="28" fill="${fill}"/>
          <text x="${x + 34}" y="266" text-anchor="middle" fill="${COLORS.white}" font-size="14" font-family="Segoe UI" font-weight="700">${index + 1}</text>
          ${index < steps.length - 1 ? `<path d="M${x + 64} 258 L${x + 90} 258" stroke="${COLORS.smoke}" stroke-width="6" stroke-linecap="round"/>` : ''}
          <text x="${x + 34}" y="316" text-anchor="middle" fill="${COLORS.navy}" font-size="11" font-family="Segoe UI" font-weight="700">${escapeXml(step)}</text>
        `;
      }).join('')}
    `);
  }

  if (variant === 'peep') {
    return wrapSvg(width, height, `
      ${common}
      <rect x="70" y="172" width="108" height="132" rx="18" fill="#eef4f6"/>
      <rect x="196" y="172" width="108" height="132" rx="18" fill="#f8efe3"/>
      <rect x="322" y="172" width="108" height="132" rx="18" fill="#edf4ea"/>
      <circle cx="124" cy="206" r="16" fill="${COLORS.navySoft}"/><rect x="108" y="224" width="32" height="54" rx="14" fill="${COLORS.navySoft}"/>
      <circle cx="250" cy="206" r="16" fill="${COLORS.gold}"/><rect x="234" y="224" width="32" height="54" rx="14" fill="${COLORS.gold}"/>
      <circle cx="376" cy="206" r="16" fill="${COLORS.green}"/><rect x="360" y="224" width="32" height="54" rx="14" fill="${COLORS.green}"/>
      <text x="124" y="292" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">mobile</text>
      <text x="250" y="292" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">assisted</text>
      <text x="376" y="292" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">PEEP</text>
    `);
  }

  if (variant === 'evacuation') {
    return wrapSvg(width, height, `
      ${common}
      <rect x="70" y="180" width="92" height="110" rx="18" fill="#edf2f5"/>
      <rect x="204" y="180" width="92" height="110" rx="18" fill="#edf2f5"/>
      <rect x="338" y="180" width="92" height="110" rx="18" fill="#dbe8df"/>
      <path d="M162 236 L204 236" stroke="${COLORS.ember}" stroke-width="8" stroke-linecap="round"/>
      <path d="M296 236 L338 236" stroke="${COLORS.green}" stroke-width="8" stroke-linecap="round"/>
      <text x="116" y="312" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">compartment 1</text>
      <text x="250" y="312" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">door line</text>
      <text x="384" y="312" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">safe zone</text>
    `);
  }

  if (variant === 'extinguisher') {
    return wrapSvg(width, height, `
      ${common}
      <rect x="74" y="178" width="76" height="116" rx="20" fill="${COLORS.red}"/>
      <rect x="168" y="178" width="76" height="116" rx="20" fill="${COLORS.gold}"/>
      <rect x="262" y="178" width="76" height="116" rx="20" fill="${COLORS.teal}"/>
      <rect x="356" y="178" width="76" height="116" rx="20" fill="${COLORS.green}"/>
      <text x="112" y="315" text-anchor="middle" fill="${COLORS.navy}" font-size="12" font-family="Segoe UI" font-weight="700">water</text>
      <text x="206" y="315" text-anchor="middle" fill="${COLORS.navy}" font-size="12" font-family="Segoe UI" font-weight="700">foam</text>
      <text x="300" y="315" text-anchor="middle" fill="${COLORS.navy}" font-size="12" font-family="Segoe UI" font-weight="700">CO2</text>
      <text x="394" y="315" text-anchor="middle" fill="${COLORS.navy}" font-size="12" font-family="Segoe UI" font-weight="700">powder</text>
      ${variant === 'extinguisher' && heading.toLowerCase().includes('pass')
        ? `<text x="250" y="348" text-anchor="middle" fill="${COLORS.ember}" font-size="16" font-family="Segoe UI" font-weight="700">PULL • AIM • SQUEEZE • SWEEP</text>`
        : ''}
    `);
  }

  if (variant === 'blanket') {
    return wrapSvg(width, height, `
      ${common}
      <rect x="118" y="168" width="264" height="144" rx="22" fill="#f7efe3" stroke="${COLORS.gold}" stroke-width="8"/>
      <rect x="198" y="196" width="104" height="88" rx="14" fill="${COLORS.white}"/>
      <path d="M250 196 L250 284" stroke="${COLORS.red}" stroke-width="8" stroke-linecap="round"/>
      <text x="250" y="338" text-anchor="middle" fill="${COLORS.navy}" font-size="16" font-family="Segoe UI" font-weight="700">smother flames • protect hands • cover pan</text>
    `);
  }

  if (variant === 'references') {
    return wrapSvg(width, height, `
      ${common}
      <rect x="88" y="176" width="104" height="132" rx="16" fill="#edf2f6"/>
      <rect x="206" y="176" width="104" height="132" rx="16" fill="#f8efe3"/>
      <rect x="324" y="176" width="104" height="132" rx="16" fill="#edf4ea"/>
      <text x="140" y="214" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">FIRE SAFETY</text>
      <text x="140" y="234" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">ORDER 2005</text>
      <text x="258" y="214" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">FIRE SAFETY</text>
      <text x="258" y="234" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">ACT 2021</text>
      <text x="376" y="214" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">CQC SAFE</text>
      <text x="376" y="234" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">GUIDANCE</text>
    `);
  }

  return wrapSvg(width, height, common);
}

function drawIcon(meta) {
  const { width, height, heading, variant } = meta;
  const lines = splitLines(heading, 18);
  return wrapSvg(width, height, `
    <rect width="${width}" height="${height}" fill="url(#bgCool)"/>
    <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="30" fill="${COLORS.white}" filter="url(#shadow)"/>
    ${multilineText(lines, 34, 54, 18, COLORS.ink, 700, 22)}
    ${variant === 'signs' ? `
      <rect x="42" y="112" width="84" height="64" rx="12" fill="${COLORS.green}"/><path d="M72 144 l14 14 l22 -28" stroke="${COLORS.white}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="174" y="112" width="84" height="64" rx="12" fill="${COLORS.red}"/><rect x="204" y="126" width="24" height="36" fill="${COLORS.white}"/><rect x="198" y="138" width="36" height="12" fill="${COLORS.red}"/>
      <rect x="42" y="194" width="84" height="64" rx="12" fill="${COLORS.teal}"/><circle cx="84" cy="226" r="16" fill="${COLORS.white}"/><rect x="80" y="212" width="8" height="28" fill="${COLORS.teal}"/>
      <rect x="174" y="194" width="84" height="64" rx="12" fill="${COLORS.gold}"/><path d="M216 206 L238 244 L194 244 Z" fill="${COLORS.white}"/><circle cx="216" cy="236" r="3" fill="${COLORS.gold}"/>
    ` : `
      <circle cx="92" cy="162" r="30" fill="${COLORS.red}"/><circle cx="92" cy="162" r="14" fill="${COLORS.white}"/>
      <rect x="152" y="132" width="76" height="60" rx="12" fill="${COLORS.navySoft}"/><rect x="168" y="146" width="44" height="28" rx="4" fill="#a8b7c5"/>
      <rect x="72" y="208" width="120" height="24" rx="12" fill="${COLORS.sand}"/><text x="132" y="225" text-anchor="middle" fill="${COLORS.navy}" font-size="13" font-family="Segoe UI" font-weight="700">detect • alert</text>
    `}
  `);
}

function buildSvg(meta) {
  if (meta.category === 'diagram') return drawDiagram(meta);
  if (meta.category === 'icon') return drawIcon(meta);
  return drawScene(meta);
}

async function savePng(browser, meta, outputPath) {
  const page = await browser.newPage({ viewport: { width: meta.width, height: meta.height }, deviceScaleFactor: 1 });
  const svg = buildSvg(meta);
  const html = `<html><body style="margin:0;background:#ffffff;">${svg}</body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width: meta.width, height: meta.height } });
  await page.close();
}

async function run() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8').replace(/^\uFEFF/, '');
  const course = JSON.parse(raw);
  const browser = await chromium.launch({ headless: true });
  const report = [];

  try {
    for (const lesson of course.lessons || []) {
      for (const section of lesson.sections || []) {
        if (!section.image) continue;

        const file = path.basename(section.image.assigned_file || section.image.expected_marker);
        const meta = {
          ...classify(file, section.heading || lesson.title || file),
          file,
          heading: section.heading || lesson.title || file,
        };

        await savePng(browser, meta, path.join(ROOT, file));
        section.image.assigned_file = file;
        section.image.expected_marker = file;
        section.image.alt_text = `${section.heading} training visual for the Fire Safety course.`;

        report.push({
          lesson: lesson.lesson_number,
          file,
          heading: meta.heading,
          category: meta.category,
          size: `${meta.width}x${meta.height}`,
        });
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(course, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ regenerated: report.length, report }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
