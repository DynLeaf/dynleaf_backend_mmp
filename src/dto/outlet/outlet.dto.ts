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
