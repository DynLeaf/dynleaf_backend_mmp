import { IBrand } from '../models/Brand.js';
import { BrandResponseDto } from '../dto/brand/brand.dto.js';

export class BrandMapper {
  static toResponseDto(brand: IBrand | any): BrandResponseDto {
    const brandObj = brand.toObject ? brand.toObject() : brand;
    
    return {
      id: brandObj._id.toString(),
      _id: brandObj._id.toString(),
      name: brandObj.name,
      slug: brandObj.slug,
      logo_url: brandObj.logo_url,
      status: brandObj.verification_status,
      description: brandObj.description,
      cuisines: brandObj.cuisines,
      is_branded: brandObj.is_branded,
      brand_theme: brandObj.brand_theme ? {
        primary_color: brandObj.brand_theme.primary_color,
        secondary_color: brandObj.brand_theme.secondary_color || brandObj.brand_theme['secondary color']
      } : null
    };
  }
}
