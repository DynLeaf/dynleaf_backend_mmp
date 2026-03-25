export type EngagementEntityType = 'food_item' | 'combo' | 'offer';

export interface EngagementPayloadDto {
  entity_type: EngagementEntityType;
  entity_id: string;
  outlet_id?: string;
}

export interface ToggleSaveResponseDto {
  entity_type: EngagementEntityType;
  entity_id: string;
  saved: boolean;
  saved_items_count: number;
}

export interface MarkSharedResponseDto {
  entity_type: EngagementEntityType;
  entity_id: string;
  shared: boolean;
  last_shared_at: Date;
  shared_items_count: number;
}

export interface EngagementStatusResponseDto {
  entity_type: EngagementEntityType;
  entity_id: string;
  is_saved: boolean;
  is_shared: boolean;
  saved_at: Date | null;
  last_shared_at: Date | null;
}

export interface SavedItemResponseDto {
  entity_type: EngagementEntityType;
  entity_id: string;
  outlet_id: string | null;
  saved_at: Date;
  title: string;
  image_url: string | null;
  outlet_name: string | null;
  outlet_slug: string | null;
  dish_slug?: string | null; // specific to food_item
}
