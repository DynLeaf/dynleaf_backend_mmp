import { IOutlet } from '../models/Outlet.js';
import { OutletResponseDto, OutletDetailResponseDto } from '../dto/outlet/outlet.dto.js';
import { BrandMapper } from './brandMapper.js';

export class OutletMapper {
  static toResponseDto(outlet: IOutlet | any): OutletResponseDto {
    const outletObj = outlet.toObject ? outlet.toObject() : outlet;
    const populatedBrand = outletObj.brand_id && typeof outletObj.brand_id === 'object' && outletObj.brand_id._id
      ? outletObj.brand_id
      : null;
    
    return {
      id: outletObj._id.toString(),
      _id: outletObj._id.toString(),
      name: outletObj.name,
      slug: outletObj.slug,
      brand_id: populatedBrand || outletObj.brand_id?._id?.toString() || outletObj.brand_id?.toString(),
      status: outletObj.status,
      approval_status: outletObj.approval_status,
      address: outletObj.address,
      contact: outletObj.contact,
      location: outletObj.location,
      media: outletObj.media,
      restaurant_type: outletObj.restaurant_type,
      vendor_types: outletObj.vendor_types,
      social_media: outletObj.social_media || {},
      instagram_reels: outletObj.instagram_reels || [],
      timezone: outletObj.timezone,
      price_range: outletObj.price_range,
      avg_rating: outletObj.avg_rating,
      total_reviews: outletObj.total_reviews,
      is_pure_veg: outletObj.is_pure_veg,
      delivery_time: outletObj.delivery_time,
      brand: populatedBrand ? BrandMapper.toResponseDto(populatedBrand) : undefined
    };
  }

  static toDetailResponseDto(outlet: any, details: { 
    operatingHours: any; 
    itemsCount: number; 
    categories: any[]; 
    followersCount: number; 
    isFollowing: boolean; 
  }): OutletDetailResponseDto {
    const outletObj = outlet.toObject ? outlet.toObject() : outlet;
    
    return {
      ...this.toResponseDto(outletObj),
      available_items_count: details.itemsCount,
      followers_count: details.followersCount,
      is_following: details.isFollowing,
      opening_hours: details.operatingHours,
      order_phone: outletObj.order_phone,
      order_link: outletObj.order_link,
      swiggy_delivery_url: outletObj.swiggy_delivery_url,
      zomato_delivery_url: outletObj.zomato_delivery_url,
      reservation_phone: outletObj.reservation_phone,
      reservation_url: outletObj.reservation_url,
      seating_capacity: outletObj.seating_capacity,
      table_count: outletObj.table_count,
      social_media: outletObj.social_media || {},
      photo_gallery: outletObj.photo_gallery || { interior: [], exterior: [], food: [] },
      amenities: outletObj.amenities || [],
      flags: outletObj.flags || { 
        is_featured: false, 
        is_trending: false, 
        accepts_online_orders: false, 
        is_open_now: false 
      },
      multi_menu_settings: outletObj.multi_menu_settings,
      ordering_settings: outletObj.ordering_settings
    };
  }
}
