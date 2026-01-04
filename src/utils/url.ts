import { AppError } from './AppError.js';

export const isValidHttpUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const normalizeOptionalString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
};

export const validateOptionalHttpUrl = (label: string, value: unknown) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return;

  if (!isValidHttpUrl(normalized)) {
    throw new AppError(`${label} must be a valid http(s) URL`, 400);
  }
};
