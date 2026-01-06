import axios from 'axios';

type SmsProvider = 'noop' | 'msg91';

export const normalizePhoneE164 = (rawPhone: string): string => {
  const trimmed = (rawPhone || '').trim();

  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  const defaultCountryCode = (process.env.DEFAULT_COUNTRY_CODE || '+91').trim();

  if (!defaultCountryCode.startsWith('+')) {
    throw new Error('DEFAULT_COUNTRY_CODE must start with + (e.g. +91)');
  }

  // India-specific convenience: allow 10-digit local numbers.
  if (defaultCountryCode === '+91' && digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }

  // India: allow country-code prefixed numbers without '+'.
  if (defaultCountryCode === '+91' && digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+91${digitsOnly.slice(2)}`;
  }

  // Generic fallback: if caller passed country code without '+', we still prefix configured default.
  if (digitsOnly.length > 0) {
    return `${defaultCountryCode}${digitsOnly}`;
  }

  throw new Error('Invalid phone number');
};

const getProvider = (): SmsProvider => {
  return (process.env.SMS_PROVIDER || 'noop').toLowerCase() as SmsProvider;
};

export const sendOtpSms = async (toPhone: string, otp: string): Promise<void> => {
  const provider = getProvider();

  if (provider === 'noop') {
    if (process.env.NODE_ENV === 'production' && process.env.SMS_ALLOW_NOOP_IN_PROD !== 'true') {
      throw new Error('SMS is not configured (SMS_PROVIDER=noop)');
    }
    console.log(`[SMS:NOOP] OTP for ${toPhone}: ${otp}`);
    return;
  }

  if (provider !== 'msg91') {
    throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
  }

  const authKey = process.env.MSG91_AUTH_KEY;
  const senderId = process.env.MSG91_SENDER_ID;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !senderId || !templateId) {
    throw new Error('MSG91 is not configured. Set MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID');
  }

  // MSG91 OTP endpoint expects mobile number without '+' and usually country code included.
  const e164 = normalizePhoneE164(toPhone);
  const mobile = e164.replace(/^\+/, '');

  // MSG91 OTP API (v5) docs vary by account; this is the common format.
  // DLT compliance typically requires a pre-approved templateId + senderId.
  await axios.post(
    'https://control.msg91.com/api/v5/otp',
    {
      template_id: templateId,
      sender: senderId,
      mobile,
      otp,
    },
    {
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
};
