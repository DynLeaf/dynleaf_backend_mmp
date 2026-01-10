import axios from 'axios';

type SmsProvider = 'noop' | 'msg91' | 'smsbuddy';

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
  console.log('prov', provider)

  if (provider === 'noop') {
    if (process.env.NODE_ENV === 'production' && process.env.SMS_ALLOW_NOOP_IN_PROD !== 'true') {
      throw new Error('SMS is not configured (SMS_PROVIDER=noop)');
    }
    console.log(`[SMS:NOOP] OTP for ${toPhone}: ${otp}`);
    return;
  }

  if (provider === 'msg91') {
    const authKey = process.env.MSG91_AUTH_KEY;
    const senderId = process.env.MSG91_SENDER_ID;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !senderId || !templateId) {
      throw new Error('MSG91 is not configured. Set MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID');
    }

    const e164 = normalizePhoneE164(toPhone);
    const mobile = e164.replace(/^\+/, '');

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
    return;
  }

  if (provider === 'smsbuddy') {
    const apiKey = process.env.SMSBUDDY_API_KEY;
    const senderId = process.env.SMSBUDDY_SENDER_ID;
    const templateId = process.env.SMSBUDDY_TEMPLATE_ID;
    const messageTemplate = process.env.SMSBUDDY_MESSAGE_TEMPLATE;
    ;
    console.log(apiKey, senderId, templateId, messageTemplate, 'i am ajmal')

    if (!apiKey || !senderId || !templateId || !messageTemplate) {
      throw new Error('SMSBuddy is not configured. Set SMSBUDDY_API_KEY, SMSBUDDY_SENDER_ID, SMSBUDDY_TEMPLATE_ID, SMSBUDDY_MESSAGE_TEMPLATE');
    }

    const e164 = normalizePhoneE164(toPhone);
    const mobile = e164.replace(/^\+/, '');

    // SMSBuddy v1/otp/create expects form-encoded data or JSON? 
    // The curl example shows -d which is usually form-encoded.
    const params = new URLSearchParams();
    params.append('key', apiKey);
    params.append('to', mobile);
    params.append('sender', senderId);
    params.append('message', messageTemplate || 'Dear Customer, Your Dynleaf verification code is {#OTP#} for Logged in. Please enter this OTP to continue');
    params.append('otp', otp);
    params.append('template_id', templateId);

    try {
      console.log(otp, 'otp')
      const url =
        `https://thesmsbuddy.com/api/v1/otp/create?key=${apiKey}&type=1&to=${mobile}&sender=${senderId}&message=Dear%20Customer%20%2C%20Your%20Dynleaf%20verification%20code%20is%20${otp}%20for%20Logged%20in%20.%20Please%20enter%20this%20OTP%20to%20continue&flash=0&template_id=1707176804088370688`;
      console.log(url, 'url')

      const response = await axios.post(
        url, {},
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      if (response.data.status !== '200') {
        throw new Error(`SMSBuddy error: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data;
        throw new Error(`SMSBuddy API failed (${error.response.status}): ${JSON.stringify(errorData) || error.message}`);
      }
      throw error;
    }
    return;
  }

  throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
};
