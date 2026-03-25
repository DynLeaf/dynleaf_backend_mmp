import mongoose from 'mongoose';

export enum NotificationType {
  PROMOTIONAL = 'promotional',
  SYSTEM = 'system',
  ENGAGEMENT = 'engagement',
  ALERT = 'alert',
  ANNOUNCEMENT = 'announcement',
  OFFER = 'offer',
  CUSTOM = 'custom',
}

export enum DeliveryStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  PARTIALLY_SENT = 'partially_sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TargetAudienceType {
  ALL_USERS = 'all_users',
  SELECTED_USERS = 'selected_users',
  USER_ROLE = 'user_role',
  SEGMENTED = 'segmented', 
}

export interface IDeliveryMetrics {
  total_recipients: number;
  sent: number;
  failed: number;
  pending: number;
  clicked: number;
  dismissed: number;
  conversion_count?: number;
}

export interface ITargetAudience {
  type: TargetAudienceType;
  roles?: string[];
  user_ids?: mongoose.Types.ObjectId[];
  filters?: {
    location?: string;
    user_type?: string;
    engagement_level?: 'high' | 'medium' | 'low';
    signup_date_range?: {
      from: Date;
      to: Date;
    };
    [key: string]: any;
  };
}

export interface IScheduling {
  type: 'immediate' | 'scheduled';
  scheduled_at?: Date;
  timezone?: string;
  recurring?: {
    enabled: boolean;
    pattern?: 'daily' | 'weekly' | 'monthly';
    end_date?: Date;
  };
}

export interface INotificationContent {
  title: string;
  description: string;
  image_url?: string;
  image_public_id?: string;
  action_url?: string;
  action_label?: string;
  icon_url?: string;
  deep_link?: string;
  custom_data?: Record<string, any>;
  expires_at?: Date;
}
