const path = require('path');
const { createWorker } = require('tesseract.js');

// Student IDs look like 10111. Change this if your school's format differs.
const ID_RE = /\b\d{5}\b/;
const COURSE_RE = /^(?:BSA|BSBA|BSCE|BSCOM|BSCS|BSEE|BSED|BSIT|BSN|BSM|BSHM|BSOA|BSCRIM)$/i;
const YEAR_SECTION_RE = /^\d{1,2}-?[A-Za-z0-9]{1,3}$/;

function normalizeToken(token) {
  return String(token || '')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    .trim();
}

function extractCourseYear(tokens) {
  const cleaned = tokens
    .map(normalizeToken)
    .filter(Boolean)
    .filter((t) => t !== '-' && !/^[-_]+$/.test(t));

  let course = '';
  let yearSection = '';
  let idx = cleaned.length - 1;

  while (idx >= 0) {
    const token = cleaned[idx];
    if (YEAR_SECTION_RE.test(token)) {
      yearSection = token.toUpperCase();
      cleaned.splice(idx, 1);
      break;
    }
    if (/^[A-Z]$/i.test(token)) {
      yearSection = '3-' + token.toUpperCase();
      cleaned.splice(idx, 1);
      break;
    }
    idx -= 1;
  }

  idx = cleaned.length - 1;
  while (idx >= 0) {
    const token = cleaned[idx].replace(/[^A-Za-z.]/g, '');
    if (COURSE_RE.test(token)) {
      course = token.toUpperCase();
      cleaned.splice(idx, 1);
      break;
    }
    idx -= 1;
  }

  return { course, yearSection, tokens: cleaned };
}

// Expected column order: ID, name, course, year/section, PIN
function parseLine(raw) {
  const text = raw.replace(/[|_[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const idMatch = text.match(ID_RE);
  if (!idMatch) return null;

  const after = text.slice(idMatch.index + idMatch[0].length).trim();
  let tokens = after
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[()]/g, ''))
    .filter(Boolean);

  let pin = '';
  if (tokens.length && /^\d{4}$/.test(tokens[tokens.length - 1])) {
    pin = tokens.pop();
  }

  const { course, yearSection, tokens: remaining } = extractCourseYear(tokens);

  const fullName = remaining
    .join(' ')
    .replace(/[^A-Za-zÀ-ÿñÑ.'\- ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const needsReview = !pin || !yearSection || !course || !fullName;
  return {
    studentId: idMatch[0],
    fullName,
    course,
    yearSection,
    pin,
    needsReview,
  };
}

async function readPhotos(filePaths) {
  const worker = await createWorker('eng', 1, {
    cachePath: path.join(__dirname, '..', '..', 'data'),
  });
  const pages = [];
  try {
    for (const file of filePaths) {
      const { data } = await worker.recognize(file);
      pages.push({ text: data.text || '', confidence: data.confidence || 0 });
    }
  } finally {
    await worker.terminate();
  }
  return pages;
}

module.exports = { parseLine, readPhotos };