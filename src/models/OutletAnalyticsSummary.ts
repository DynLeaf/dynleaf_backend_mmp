import mongoose, { Schema, Document } from 'mongoose';

export interface IOutletAnalyticsSummary extends Document {
  outlet_id: mongoose.Types.ObjectId;
  date: Date;

  metrics: {
    outlet_visits: number;
    profile_views: number;
    menu_views: number;
    qr_menu_views: number; // Menu views via QR scans
    qr_profile_views: number; // Profile views via QR scans
    unique_sessions: number;
    view_to_menu_rate: number; // menu_views / profile_views

    // Source breakdown for profile views
    profile_view_sources: {
      qr_scan: number;
      whatsapp: number;
      link: number;
      telegram: number;
      twitter: number;
      share: number;
      search: number;
      home: number;
      menu_page: number;
      direct_url: number;
      other: number;
    };

    // Source breakdown for menu views
    menu_view_sources: {
      qr_scan: number;
      whatsapp: number;
      link: number;
      telegram: number;
      twitter: number;
      share: number;
      search: number;
      home: number;
      profile_page: number;
      direct_url: number;
      other: number;
    };
  };

  device_breakdown: {
    mobile: number;
    desktop: number;
    tablet: number;
  };

  hourly_breakdown: Array<{
    hour: number;
    profile_views: number;
    menu_views: number;
  }>;
}

const outletAnalyticsSummarySchema = new Schema<IOutletAnalyticsSummary>(
  {
    outlet_id: {
      type: Schema.Types.ObjectId,
      ref: 'Outlet',
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },

    metrics: {
      outlet_visits: { type: Number, default: 0 },
      profile_views: { type: Number, default: 0 },
      menu_views: { type: Number, default: 0 },
      qr_menu_views: { type: Number, default: 0 },
      qr_profile_views: { type: Number, default: 0 },
      unique_sessions: { type: Number, default: 0 },
      view_to_menu_rate: { type: Number, default: 0 },

      profile_view_sources: {
        qr_scan: { type: Number, default: 0 },
        whatsapp: { type: Number, default: 0 },
        link: { type: Number, default: 0 },
        telegram: { type: Number, default: 0 },
        twitter: { type: Number, default: 0 },
        share: { type: Number, default: 0 },
        search: { type: Number, default: 0 },
        home: { type: Number, default: 0 },
        menu_page: { type: Number, default: 0 },
        direct_url: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },

      menu_view_sources: {
        qr_scan: { type: Number, default: 0 },
        whatsapp: { type: Number, default: 0 },
        link: { type: Number, default: 0 },
        telegram: { type: Number, default: 0 },
        twitter: { type: Number, default: 0 },
        share: { type: Number, default: 0 },
        search: { type: Number, default: 0 },
        home: { type: Number, default: 0 },
        profile_page: { type: Number, default: 0 },
        direct_url: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
      },
    },

    device_breakdown: {
      mobile: { type: Number, default: 0 },
      desktop: { type: Number, default: 0 },
      tablet: { type: Number, default: 0 },
    },

    hourly_breakdown: [
      {
        hour: { type: Number, min: 0, max: 23 },
        profile_views: { type: Number, default: 0 },
        menu_views: { type: Number, default: 0 },
      },
    ],
  },
  {
    timestamps: true,
  }
);

outletAnalyticsSummarySchema.index({ outlet_id: 1, date: 1 }, { unique: true });
outletAnalyticsSummarySchema.index({ date: -1 });

export const OutletAnalyticsSummary = mongoose.model<IOutletAnalyticsSummary>(
  'OutletAnalyticsSummary',
  outletAnalyticsSummarySchema
);
