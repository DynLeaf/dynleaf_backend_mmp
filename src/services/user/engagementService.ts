import mongoose from 'mongoose';
import * as userRepo from '../../repositories/userRepository.js';
import * as foodItemRepo from '../../repositories/foodItemRepository.js';
import * as comboRepo from '../../repositories/comboRepository.js';
import * as offerRepo from '../../repositories/offerRepository.js';
import * as outletRepo from '../../repositories/outletRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

type EngagementEntityType = 'food_item' | 'combo' | 'offer';

export const toggleSaveItem = async (
  userId: string,
  entityType: EngagementEntityType,
  entityId: string,
  outletId?: string
) => {
  const data = await userRepo.getSavedAndSharedItems(userId);
  if (!data) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  const savedItems = data.saved_items;
  const existingIndex = savedItems.findIndex(
    (item: any) => item.entity_type === entityType && String(item.entity_id) === entityId
  );

  let resolvedOutletObjectId: mongoose.Types.ObjectId | undefined;
  if (outletId) {
    const outlet = await outletRepo.findBySlugOrId(outletId);
    if (outlet) resolvedOutletObjectId = new mongoose.Types.ObjectId(String(outlet._id));
  }

  let saved = false;
  if (existingIndex >= 0) {
    savedItems.splice(existingIndex, 1);
  } else {
    savedItems.push({
      entity_type: entityType,
      entity_id: new mongoose.Types.ObjectId(entityId),
      outlet_id: resolvedOutletObjectId,
      saved_at: new Date(),
    });
    saved = true;
  }

  await userRepo.updateSavedItems(userId, savedItems);

  return {
    entity_type: entityType,
    entity_id: entityId,
    saved,
    saved_items_count: savedItems.length,
  };
};

export const markSharedItem = async (
  userId: string,
  entityType: EngagementEntityType,
  entityId: string,
  outletId?: string
) => {
  const data = await userRepo.getSavedAndSharedItems(userId);
  if (!data) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  const sharedItems = data.shared_items;
  const existingIndex = sharedItems.findIndex(
    (item: any) => item.entity_type === entityType && String(item.entity_id) === entityId
  );

  let resolvedOutletObjectId: mongoose.Types.ObjectId | undefined;
  if (outletId) {
    const outlet = await outletRepo.findBySlugOrId(outletId);
    if (outlet) resolvedOutletObjectId = new mongoose.Types.ObjectId(String(outlet._id));
  }

  if (existingIndex >= 0) {
    sharedItems[existingIndex].shared_at = new Date();
    if (resolvedOutletObjectId) {
      sharedItems[existingIndex].outlet_id = resolvedOutletObjectId;
    }
  } else {
    sharedItems.push({
      entity_type: entityType,
      entity_id: new mongoose.Types.ObjectId(entityId),
      outlet_id: resolvedOutletObjectId,
      shared_at: new Date(),
    });
  }

  await userRepo.updateSharedItems(userId, sharedItems);

  return {
    entity_type: entityType,
    entity_id: entityId,
    shared: true,
    last_shared_at: new Date(),
    shared_items_count: sharedItems.length,
  };
};

export const getEngagementStatus = async (
  userId: string,
  entityType: EngagementEntityType,
  entityId: string
) => {
  const data = await userRepo.getSavedAndSharedItems(userId);
  if (!data) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  const savedItem = data.saved_items.find(
    (item: any) => item.entity_type === entityType && String(item.entity_id) === entityId
  );
  const sharedItem = data.shared_items.find(
    (item: any) => item.entity_type === entityType && String(item.entity_id) === entityId
  );

  return {
    entity_type: entityType,
    entity_id: entityId,
    is_saved: !!savedItem,
    is_shared: !!sharedItem,
    saved_at: savedItem?.saved_at || null,
    last_shared_at: sharedItem?.shared_at || null,
  };
};

export const getSavedItemsPaged = async (userId: string, page: number, limit: number) => {
  const data = await userRepo.getSavedAndSharedItems(userId);
  if (!data) throw new AppError('User not found', 404, ErrorCode.USER_NOT_FOUND);

  const savedItems = [...data.saved_items].sort(
    (a: any, b: any) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
  );

  const total = savedItems.length;
  const start = (page - 1) * limit;
  const pagedItems = savedItems.slice(start, start + limit);

  const foodItemIds = pagedItems.filter((i: any) => i.entity_type === 'food_item').map((i: any) => String(i.entity_id));
  const comboIds = pagedItems.filter((i: any) => i.entity_type === 'combo').map((i: any) => String(i.entity_id));
  const offerIds = pagedItems.filter((i: any) => i.entity_type === 'offer').map((i: any) => String(i.entity_id));

  const [foodItems, combos, offers] = await Promise.all([
    foodItemIds.length > 0 ? foodItemRepo.findByIds(foodItemIds) : Promise.resolve([]),
    comboIds.length > 0 ? comboRepo.findByIds(comboIds) : Promise.resolve([]),
    offerIds.length > 0 ? offerRepo.findByIds(offerIds) : Promise.resolve([]),
  ]);

  const foodMap = new Map(foodItems.map((item: any) => [String(item._id), item]));
  const comboMap = new Map(combos.map((item: any) => [String(item._id), item]));
  const offerMap = new Map(offers.map((item: any) => [String(item._id), item]));

  const outletIds = new Set<string>();
  pagedItems.forEach((item: any) => {
    if (item.outlet_id) outletIds.add(String(item.outlet_id));
    if (item.entity_type === 'food_item' && foodMap.get(String(item.entity_id))?.outlet_id) {
      outletIds.add(String(foodMap.get(String(item.entity_id))?.outlet_id));
    }
    if (item.entity_type === 'combo' && comboMap.get(String(item.entity_id))?.outlet_id) {
      outletIds.add(String(comboMap.get(String(item.entity_id))?.outlet_id));
    }
    if (item.entity_type === 'offer' && offerMap.get(String(item.entity_id))?.outlet_ids?.[0]) {
      outletIds.add(String(offerMap.get(String(item.entity_id))?.outlet_ids[0]));
    }
  });

  const outlets = outletIds.size > 0 ? await outletRepo.findByIds(Array.from(outletIds)) : [];
  const outletMap = new Map<string, any>(outlets.map((o: any) => [String(o._id), o]));

  const mappedItems = pagedItems.map((item: any) => {
    const entityId = String(item.entity_id);
    if (item.entity_type === 'food_item') {
      const food = foodMap.get(entityId);
      const outletId = String(item.outlet_id || food?.outlet_id || '');
      const outlet = outletMap.get(outletId);
      return {
        entity_type: 'food_item',
        entity_id: entityId,
        outlet_id: outletId || null,
        saved_at: item.saved_at,
        title: food?.name || 'Food item',
        image_url: food?.image_url || null,
        outlet_name: outlet?.name || null,
        outlet_slug: outlet?.slug || null,
        dish_slug: food?.slug || null,
      };
    }
    if (item.entity_type === 'combo') {
      const combo = comboMap.get(entityId);
      const outletId = String(item.outlet_id || combo?.outlet_id || '');
      const outlet = outletMap.get(outletId);
      return {
        entity_type: 'combo',
        entity_id: entityId,
        outlet_id: outletId || null,
        saved_at: item.saved_at,
        title: combo?.name || 'Combo',
        image_url: combo?.image_url || null,
        outlet_name: outlet?.name || null,
        outlet_slug: outlet?.slug || null,
      };
    }
    const offer = offerMap.get(entityId);
    const outletId = String(item.outlet_id || offer?.outlet_ids?.[0] || '');
    const outlet = outletMap.get(outletId);
    return {
      entity_type: 'offer',
      entity_id: entityId,
      outlet_id: outletId || null,
      saved_at: item.saved_at,
      title: offer?.title || 'Offer',
      image_url: offer?.banner_image_url || null,
      outlet_name: outlet?.name || null,
      outlet_slug: outlet?.slug || null,
    };
  });

  return {
    items: mappedItems,
    pagination: {
      page,
      limit,
      total,
      hasMore: start + limit < total,
    },
  };
};
