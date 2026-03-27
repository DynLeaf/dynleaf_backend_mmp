import mongoose from 'mongoose';
import * as outletRepo from '../../repositories/outletRepository.js';
import * as foodItemRepo from '../../repositories/foodItemRepository.js';
import * as comboRepo from '../../repositories/comboRepository.js';
import * as followRepo from '../../repositories/followRepository.js';
import { voteRepository } from '../../repositories/vote/voteRepository.js';
import { AppError, ErrorCode } from '../../errors/AppError.js';

export const getOutletMenu = async (outletId: string, queryParams: Record<string, unknown>, userId?: string) => {
    const { category, foodType, isVeg, isAvailable, search, sortBy = 'category' } = queryParams as { 
        category?: string; 
        foodType?: string; 
        isVeg?: string; 
        isAvailable?: string; 
        search?: string; 
        sortBy?: string; 
    };

    const outlet = await outletRepo.findBySlugOrId(outletId) as { _id: mongoose.Types.ObjectId };
    if (!outlet) throw new AppError('Outlet not found', 404, ErrorCode.RESOURCE_NOT_FOUND);

    const actualOutletId = outlet._id;

    const pipeline: mongoose.PipelineStage[] = [
        { $match: { outlet_id: new mongoose.Types.ObjectId(actualOutletId as any as string), is_active: true } }
    ];

    if (isAvailable === 'true') pipeline.push({ $match: { is_available: true } });
    if (foodType) pipeline.push({ $match: { food_type: foodType } });
    if (isVeg === 'true') pipeline.push({ $match: { is_veg: true } });
    else if (isVeg === 'false') pipeline.push({ $match: { is_veg: false } });

    if (search) {
        pipeline.push({
            $match: {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { tags: { $in: [new RegExp(search, 'i')] } }
                ]
            }
        });
    }

    pipeline.push(
        {
            $lookup: {
                from: 'categories',
                localField: 'category_id',
                foreignField: '_id',
                as: 'category'
            }
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $match: { 'category.is_active': { $ne: false } } },
        {
            $lookup: {
                from: 'addons',
                localField: 'addon_ids',
                foreignField: '_id',
                as: 'addons'
            }
        }
    );

    if (category) {
        pipeline.push({
            $match: {
                $or: [
                    { 'category.slug': category },
                    { 'category.name': category }
                ]
            }
        });
    }

    if (sortBy === 'price_low') pipeline.push({ $sort: { price: 1 } });
    else if (sortBy === 'price_high') pipeline.push({ $sort: { price: -1 } });
    else if (sortBy === 'popular') pipeline.push({ $sort: { order_count: -1 } });
    else if (sortBy === 'rating') pipeline.push({ $sort: { avg_rating: -1 } });
    else pipeline.push({ $sort: { 'category.display_order': 1, display_order: 1 } });

    const menuItems = await foodItemRepo.aggregateFoodItems(pipeline);
    const combos = await comboRepo.findActiveCombosWithItems(actualOutletId as any as string);

    const userVotes: Map<string, string> = new Map();
    if (userId) {
        const itemIds = menuItems.map(item => item._id.toString());
        const votes = await voteRepository.findUserVotesForItems(userId, itemIds);
        votes.forEach((vote) => {
            userVotes.set(vote.food_item_id.toString(), vote.vote_type);
        });
    }

    return {
        menuItems,
        combos,
        userVotes,
        outlet,
        followersCount: await followRepo.countByOutlet(actualOutletId as any as string),
        isFollowing: userId ? await followRepo.isFollowing(userId, actualOutletId as any as string) : false
    };
};

export const updateOutletMenuItem = async (outletId: string, foodItemId: string, updateData: Record<string, unknown>) => {
    const foodItem = await foodItemRepo.findAndUpdateFoodItem(outletId, foodItemId, updateData);
    if (!foodItem) throw new AppError('Food item not found or does not belong to this outlet', 404);
    return foodItem;
};

export const reorderOutletMenu = async (outletId: string, items: Array<{ menu_item_id: string; display_order: number }>) => {
    const bulkOps = items.map(item => ({
        updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(item.menu_item_id), outlet_id: new mongoose.Types.ObjectId(outletId) },
            update: { $set: { display_order: item.display_order } }
        }
    })) as mongoose.AnyBulkWriteOperation<any>[];
    return await foodItemRepo.bulkWrite(bulkOps);
};

export const toggleMenuItemAvailability = async (outletId: string, foodItemId: string) => {
    const foodItem = await foodItemRepo.findByOutletAndId(outletId, foodItemId);
    if (!foodItem) throw new AppError('Food item not found', 404);
    
    // Toggle using repo
    const updated = await foodItemRepo.findAndUpdateFoodItem(outletId, foodItemId, { is_available: !(foodItem as any).is_available });
    return { is_available: (updated as any).is_available };
};

export const getOutletMenuCategories = async (outletId: string) => {
    const menuItems = await foodItemRepo.findActiveItemsWithCategory(outletId);

    const categoriesMap = new Map<string, { _id: mongoose.Types.ObjectId; name: string; slug: string; items_count: number }>();
    menuItems.forEach((item: any) => {
        const category = item.category_id as { _id: mongoose.Types.ObjectId; name: string; slug: string };
        if (category) {
            const catId = category._id.toString();
            const existing = categoriesMap.get(catId);
            if (!existing) {
                categoriesMap.set(catId, {
                    _id: category._id,
                    name: category.name,
                    slug: category.slug,
                    items_count: 1
                });
            } else {
                existing.items_count++;
            }
        }
    });

    return Array.from(categoriesMap.values());
};
