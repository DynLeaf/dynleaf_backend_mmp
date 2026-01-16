import mongoose, { Schema, Document } from 'mongoose';

/**
 * PushNotification Model - Scalable notification system for future expansion
 * Supports multiple notification types, targeting strategies, and delivery tracking
 */

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
  SEGMENTED = 'segmented', // Future: custom segments
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
    [key: string]: any; // Future: extensible filters
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
  image_public_id?: string; // Cloudinary public ID for easy deletion
  action_url?: string;
  action_label?: string;
  icon_url?: string;
  deep_link?: string;
  custom_data?: Record<string, any>;
  expires_at?: Date; // When to stop showing this notification
}

export interface IPushNotificationDocument extends Document {
  // Basic Info
  title: string;
  description: string;
  notification_type: NotificationType;
  status: DeliveryStatus;

  // Content
  content: INotificationContent;

  // Targeting
  target_audience: ITargetAudience;

  // Scheduling & Delivery
  scheduling: IScheduling;
  delivery_metrics: IDeliveryMetrics;

  // Admin Info
  created_by: mongoose.Types.ObjectId; // Admin user ID
  campaign_id?: string; // For grouping related notifications
  category?: string; // For organization
  tags?: string[]; // For filtering and analytics

  // Analytics & Tracking
  analytics: {
    views: number;
    clicks: number;
    ctr: number; // Click Through Rate
    conversions: number;
    last_updated_at: Date;
  };

  // Retry Logic
  retry_policy: {
    max_retries: number;
    retry_after_minutes: number;
    failed_delivery_reason?: string[];
  };

  // Event Logs
  events: Array<{
    event_type: 'created' | 'scheduled' | 'sent' | 'failed' | 'clicked' | 'dismissed';
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;

  // Timestamps
  created_at: Date;
  updated_at: Date;
  sent_at?: Date;
  scheduled_at?: Date;

  // Methods
  toJSON(): any;
}

const deliveryMetricsSchema = new Schema<IDeliveryMetrics>(
  {
    total_recipients: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    dismissed: { type: Number, default: 0 },
    conversion_count: { type: Number, default: 0 },
  },
  { _id: false }
);

const targetAudienceSchema = new Schema<ITargetAudience>(
  {
    type: {
      type: String,
      enum: Object.values(TargetAudienceType),
      required: true,
      default: TargetAudienceType.ALL_USERS,
    },
    roles: [{ type: String }],
    user_ids: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    filters: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const schedulingSchema = new Schema<IScheduling>(
  {
    type: { type: String, enum: ['immediate', 'scheduled'], default: 'immediate' },
    scheduled_at: { type: Date },
    timezone: { type: String, default: 'UTC' },
    recurring: {
      enabled: { type: Boolean, default: false },
      pattern: { type: String, enum: ['daily', 'weekly', 'monthly'] },
      end_date: { type: Date },
    },
  },
  { _id: false }
);

const notificationContentSchema = new Schema<INotificationContent>(
  {
    title: { type: String, required: true, maxlength: 100, trim: true },
    description: { type: String, required: true, maxlength: 500, trim: true },
    image_url: { type: String },
    image_public_id: { type: String }, // Cloudinary public ID
    action_url: { type: String },
    action_label: { type: String, maxlength: 50 },
    icon_url: { type: String },
    deep_link: { type: String },
    custom_data: { type: Schema.Types.Mixed, default: {} },
    expires_at: { type: Date },
  },
  { _id: false }
);

const pushNotificationSchema = new Schema<IPushNotificationDocument>(
  {
    // Basic Info
    title: { type: String, required: true, maxlength: 100, trim: true },
    description: { type: String, required: true, maxlength: 500, trim: true },
    notification_type: {
      type: String,
      enum: Object.values(NotificationType),
      default: NotificationType.PROMOTIONAL,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(DeliveryStatus),
      default: DeliveryStatus.DRAFT,
      index: true,
    },

    // Content
    content: { type: notificationContentSchema, required: true },

    // Targeting
    target_audience: { type: targetAudienceSchema, required: true },

    // Scheduling & Delivery
    scheduling: { type: schedulingSchema, required: true },
    delivery_metrics: { type: deliveryMetricsSchema, default: {} },

    // Admin Info
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    campaign_id: { type: String, sparse: true },
    category: { type: String },
    tags: [{ type: String }],

    // Analytics & Tracking
    analytics: {
      views: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      ctr: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      last_updated_at: { type: Date, default: Date.now },
    },

    // Retry Logic
    retry_policy: {
      max_retries: { type: Number, default: 3 },
      retry_after_minutes: { type: Number, default: 5 },
      failed_delivery_reason: [{ type: String }],
    },

    // Event Logs
    events: [
      {
        event_type: {
          type: String,
          enum: ['created', 'scheduled', 'sent', 'failed', 'clicked', 'dismissed'],
        },
        timestamp: { type: Date, default: Date.now },
        metadata: { type: Schema.Types.Mixed },
        _id: false,
      },
    ],

    // Timestamps
    created_at: { type: Date, default: Date.now, index: true },
    updated_at: { type: Date, default: Date.now },
    sent_at: { type: Date },
    scheduled_at: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'push_notifications',
  }
);

// Indexes for efficient querying
pushNotificationSchema.index({ created_by: 1, created_at: -1 });
pushNotificationSchema.index({ status: 1, created_at: -1 });
pushNotificationSchema.index({ notification_type: 1 });
pushNotificationSchema.index({ campaign_id: 1 });
pushNotificationSchema.index({ tags: 1 });
pushNotificationSchema.index({ 'scheduling.scheduled_at': 1 });
pushNotificationSchema.index({ status: 1, 'scheduling.scheduled_at': 1 }); // For scheduler jobs
pushNotificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 7776000 }); // Auto-delete after 90 days

// Virtual for computing CTR
pushNotificationSchema.virtual('computed_ctr').get(function () {
  if (this.delivery_metrics.sent === 0) return 0;
  return (this.analytics.clicks / this.delivery_metrics.sent) * 100;
});

// Pre-save hook to validate scheduling
pushNotificationSchema.pre('save', async function () {
  // Validate scheduling
  if (this.scheduling.type === 'scheduled' && !this.scheduling.scheduled_at) {
    throw new Error('scheduled_at is required when scheduling type is scheduled');
  }

  if (
    this.scheduling.scheduled_at &&
    this.scheduling.scheduled_at < new Date()
  ) {
    throw new Error('scheduled_at cannot be in the past');
  }

  // Update analytics last_updated_at
  this.analytics.last_updated_at = new Date();
});


// Method to add event log
pushNotificationSchema.methods.addEvent = function (
  event_type: string,
  metadata?: Record<string, any>
) {
  this.events.push({
    event_type: event_type as any,
    timestamp: new Date(),
    metadata,
  });
  return this.save();
};

// Method to update delivery metrics
pushNotificationSchema.methods.updateDeliveryMetrics = function (
  updates: Partial<IDeliveryMetrics>
) {
  Object.assign(this.delivery_metrics, updates);
  return this.save();
};

// Method to mark as sent
pushNotificationSchema.methods.markAsSent = function () {
  this.status = DeliveryStatus.SENT;
  this.sent_at = new Date();
  return this.addEvent('sent', { sent_at: new Date() });
};

// Method to mark as failed
pushNotificationSchema.methods.markAsFailed = function (reason?: string) {
  this.status = DeliveryStatus.FAILED;
  if (reason) {
    this.retry_policy.failed_delivery_reason?.push(reason);
  }
  return this.addEvent('failed', { reason });
};

// JSON serialization
pushNotificationSchema.methods.toJSON = function () {
  const doc = this.toObject();
  doc.computed_ctr = this.computed_ctr;
  return doc;
};

export const PushNotification = mongoose.model<IPushNotificationDocument>(
  'PushNotification',
  pushNotificationSchema
);
