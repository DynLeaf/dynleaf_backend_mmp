const toSlug = (value?: string) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

const toTitleCase = (value?: string) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const normalizeAddressComponent = (value?: string) => {
  if (!value) return '';

  return toTitleCase(
    value
      .replace(/\bedited\b/gi, ' ')
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
};

export const normalizeMallName = (mallName?: string) => {
  if (!mallName) return '';

  const normalized = mallName.replace(/\s+/g, ' ').trim();
  const mallMatch = normalized.match(/^(.+?\bmall\b)/i);
  const foodCourtMatch = normalized.match(/^(.+?\bfood\s*court\b)/i);
  const clipped = mallMatch?.[1] || foodCourtMatch?.[1] || normalized;

  const cleaned = clipped
    .replace(/\bnear\s*by\b/gi, ' ')
    .replace(/\bedited\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const title = toTitleCase(cleaned);
  if (!title || /^(mall|food court)$/i.test(title)) {
    return '';
  }

  return title;
};

export const extractMallName = (addressFull?: string) => {
  if (!addressFull) return null;

  const normalized = addressFull.replace(/\s+/g, ' ').trim();
  const segmentPatterns = [
    /([^,]*\b(?:mall|food\s*court)\b[^,]*)/i,
    /([^|]*\b(?:mall|food\s*court)\b[^|]*)/i,
    /(\b(?:mall|food\s*court)\b.*)$/i
  ];

  for (const pattern of segmentPatterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length >= 3) {
      return toTitleCase(candidate);
    }
  }

  return null;
};

export const buildMallKey = (mallName: string, city?: string, state?: string) => {
  const normalizedMallName = normalizeMallName(mallName) || toTitleCase(mallName);
  const mallSlug = toSlug(normalizedMallName);
  const citySlug = toSlug(normalizeAddressComponent(city)) || 'unknown-city';
  const stateSlug = toSlug(normalizeAddressComponent(state)) || 'unknown-state';
  return `${mallSlug}-${citySlug}-${stateSlug}`;
};

export const getMallGroupKey = (mallName: string) => toSlug(normalizeMallName(mallName) || mallName);

export const extractGroupKeyFromMallKey = (mallKey: string) => {
  const parts = mallKey.split('-').filter(Boolean);
  if (parts.length <= 2) return mallKey;
  return parts.slice(0, -2).join('-');
};
