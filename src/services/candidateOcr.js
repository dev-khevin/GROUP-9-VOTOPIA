// Student IDs look like 10111. Change this if your school's format differs.
const ID_RE = /\b\d{5}\b/;

const escapeRe = (s) => s.replace(/[.*+?^${}()[\]\\|]/g, '\\$&');

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

// Expected column order: ID, name, course, year/section, position, partylist
// "positions" is the list of position names already set up, so the reader
// can find the position text in the middle of the line.
function parseCandidateLine(raw, positions) {
  const text = raw.replace(/[|_[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const idMatch = text.match(ID_RE);
  if (!idMatch) return null;

  const after = text.slice(idMatch.index + idMatch[0].length).trim();

  // Try the longest position names first so "Vice President" wins over "President"
  const sorted = [...positions].sort((a, b) => b.name.length - a.name.length);
  let position = null;
  let before = after;
  let tail = '';
  for (const p of sorted) {
    const pattern = escapeRe(p.name.trim()).replace(/\s+/g, '\\s+');
    const m = after.match(new RegExp('(^|\\s)' + pattern + '(?=\\s|$)', 'i'));
    if (m) {
      position = p;
      before = after.slice(0, m.index).trim();
      tail = after.slice(m.index + m[0].length).trim();
      break;
    }
  }

  const tokens = before
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/[()]/g, ''))
    .filter(Boolean);

  const { course, yearSection, tokens: remaining } = extractCourseYear(tokens);

  const fullName = remaining
    .join(' ')
    .replace(/[^A-Za-zÀ-ÿñÑ.'\- ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  let partylist = tail.replace(/[^A-Za-z0-9 .'&\-]/g, '').trim();
  if (/^(-+|none|n\/a|na)$/i.test(partylist)) partylist = '';

  return {
    studentId: idMatch[0],
    fullName,
    course,
    yearSection,
    partylist,
    positionId: position ? position.id : null,
    needsReview: !position || !fullName || !course || !yearSection,
  };
}

module.exports = { parseCandidateLine };