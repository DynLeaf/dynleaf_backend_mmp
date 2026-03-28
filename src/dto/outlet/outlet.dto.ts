export interface CreateOutletRequestDto {
  brandId: string;
  name: string;
  address: {
    full?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  latitude: string | number;
  longitude: string | number;
  contact?: {
    phone?: string;
    email?: string;
  };
  coverImage?: string;
  restaurantType: string[];
  vendorTypes: string[];
  seatingCapacity?: number;
  tableCount?: number;
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    google_review?: string;
  };
  priceRange?: number[];
  isPureVeg?: boolean;
  deliveryTime?: string;
}

export interface UpdateOutletRequestDto {
  name?: string;
  address?: any;
  latitude?: string | number;
  longitude?: string | number;
  contact?: any;
  coverImage?: string;
  restaurantType?: string[];
  vendorTypes?: string[];
  seatingCapacity?: number;
  tableCount?: number;
  socialMedia?: any;
  priceRange?: number[];
  isPureVeg?: boolean;
  deliveryTime?: string;
  deliveryEnabled?: boolean;
  orderPhone?: string;
  orderLink?: string;
  swiggyDeliveryUrl?: string;
  zomatoDeliveryUrl?: string;
  reservationPhone?: string;
  reservationUrl?: string;
  operatingHours?: any;
  amenities?: string[];
}

export interface ComplianceDto {
  fssaiNumber?: string;
  gstNumber?: string;
  gstPercentage?: number;
}

export interface PhotoGalleryUploadDto {
  category: 'interior' | 'exterior' | 'food';
  image?: string;
  url?: string;
  photoUrl?: string;
  imageUrl?: string;
}

export interface PhotoGalleryDeleteDto {
  category: 'interior' | 'exterior' | 'food';
  photoUrl: string;
}

export interface OperatingHoursDto {
  timezone: string;
  days: {
    dayOfWeek: number;
    open: string;
    close: string;
    isClosed: boolean;
  }[];
}

export interface InstagramReelDto {
  url: string;
  thumbnailUrl?: string;
}

export interface ReorderReelsDto {
  reelIds: string[];
}

export interface OutletResponseDto {
  id: string;
  _id: string;
  name: string;
  slug: string;
  brand_id: string | any;
  status: string;
  approval_status: string;
  address?: any;
  contact?: any;
  location?: any;
  media?: {
    cover_image_url?: string;
  };
  restaurant_type?: string;
  vendor_types?: string[];
  social_media?: any;
  instagram_reels?: any[];
  timezone?: string;
  price_range?: number;
  avg_rating?: number;
  total_reviews?: number;
  is_pure_veg?: boolean;
  delivery_time?: number;
  brand?: any; // Will be populated if requested
}

export interface OutletDetailResponseDto extends OutletResponseDto {
  available_items_count: number;
  followers_count: number;
  is_following: boolean;
  opening_hours: any;
  order_phone?: string;
  order_link?: string;
  swiggy_delivery_url?: string;
  zomato_delivery_url?: string;
  reservation_phone?: string;
  reservation_url?: string;
  seating_capacity?: number;
  table_count?: number;
  social_media: any;
  photo_gallery: any;
  amenities: string[];
  flags: {
    is_featured: boolean;
    is_trending: boolean;
    accepts_online_orders: boolean;
    is_open_now: boolean;
  };
  multi_menu_settings?: {
    has_sub_menus: boolean;
    ask_submenu_on_scan: boolean;
  };
  ordering_settings?: {
    whatsapp_number?: string;
    enable_qr_ordering: boolean;
    enable_link_ordering: boolean;
  };
}
