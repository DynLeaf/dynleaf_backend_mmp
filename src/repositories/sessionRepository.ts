import { Session } from '../models/Session.js';

export interface SessionPlain {
  _id: string;
  user_id: string;
  device_info: {
    device_id: string;
    device_name?: string;
    device_type: string;
    os?: string;
    browser?: string;
    ip_address: string;
  };
  is_active: boolean;
  expires_at: Date;
  last_used_at: Date;
  created_at: Date;
}

export const findById = async (sessionId: string): Promise<SessionPlain | null> => {
  const session = await Session.findById(sessionId).lean();
  if (!session) return null;
  return {
    _id: String(session._id),
    user_id: String(session.user_id),
    device_info: session.device_info,
    is_active: session.is_active,
    expires_at: session.expires_at,
    last_used_at: session.last_used_at,
    created_at: session.created_at,
  };
};
