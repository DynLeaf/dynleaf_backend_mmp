import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Outlet } from '../models/Outlet.js';
import { FoodItem } from '../models/FoodItem.js';
import { Category } from '../models/Category.js';
import { Combo } from '../models/Combo.js';
import { OutletMenuItem } from '../models/OutletMenuItem.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

/**
 * Get outlet's menu with all items (NEW: Direct from FoodItem, no junction table)
 * GET /api/v1/outlets/:outletId/menu
 * Query params: category, foodType, isAvailable, search, sortBy
 */
export const getOutletMenu = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    const { category, foodType, isVeg, isAvailable, search, sortBy = 'category' } = req.query;

    // Verify outlet exists
    const outlet = await Outlet.findById(outletId).populate('brand_id', 'name logo_url cuisines');
    if (!outlet) {
      return res.status(404).json({
        status: false,
        message: 'Outlet not found'
      });
    }

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: { outlet_id: new mongoose.Types.ObjectId(outletId), is_active: true } }
    ];

    // Filter by availability
    if (isAvailable === 'true') {
      pipeline.push({ $match: { is_available: true } });
    }

    // Filter by food type
    if (foodType) {
      pipeline.push({ $match: { food_type: foodType } });
    }

    // Filter by veg (backward compatibility)
    if (isVeg === 'true') {
      pipeline.push({ $match: { is_veg: true } });
    } else if (isVeg === 'false') {
      pipeline.push({ $match: { is_veg: false } });
    }

    // Search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search as string, 'i')] } }
          ]
        }
      });
    }

    // Lookup category
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
      // Filter by category active status (Public menu should only show active categories)
      { $match: { 'category.is_active': { $ne: false } } },
      // Lookup addons
      {
        $lookup: {
          from: 'addons',
          localField: 'addon_ids',
          foreignField: '_id',
          as: 'addons'
        }
      }
    );

    // Filter by category if specified
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

    // Sort
    if (sortBy === 'price_low') {
      pipeline.push({ $sort: { price: 1 } });
    } else if (sortBy === 'price_high') {
      pipeline.push({ $sort: { price: -1 } });
    } else if (sortBy === 'popular') {
      pipeline.push({ $sort: { order_count: -1 } });
    } else if (sortBy === 'rating') {
      pipeline.push({ $sort: { avg_rating: -1 } });
    } else {
      // Default: group by category
      pipeline.push({ $sort: { 'category.display_order': 1, display_order: 1 } });
    }

    const menuItems = await FoodItem.aggregate(pipeline);

    // Fetch active combos for the outlet
    const combos = await Combo.find({
      outlet_id: new mongoose.Types.ObjectId(outletId),
      is_active: true
    })
      .populate('items.food_item_id')
      .sort({ display_order: 1, order_count: -1 })
      .lean();

    // Format combos
    const formattedCombos = combos.map((combo: any) => ({
      _id: combo._id,
      name: combo.name,
      slug: combo.slug,
      description: combo.description,
      image_url: combo.image_url,
      items: combo.items.map((item: any) => ({
        food_item_id: item.food_item_id?._id,
        name: item.food_item_id?.name,
        image_url: item.food_item_id?.image_url,
        food_type: item.food_item_id?.food_type,
        quantity: item.quantity,
        individual_price: item.food_item_id?.price
      })),
      combo_price: combo.combo_price,
      original_price: combo.original_price,
      discount_percentage: combo.discount_percentage,
      food_type: combo.food_type,
      is_available: combo.is_available,
      avg_rating: combo.avg_rating,
      total_votes: combo.total_votes,
      order_count: combo.order_count
    }));

    // Group by category if not searching/filtering heavily
    let formattedMenu;
    if (!search && sortBy === 'category') {
      const grouped = menuItems.reduce((acc: any, item: any) => {
        const categoryId = item.category?._id?.toString() || 'uncategorized';
        const categoryName = item.category?.name || 'Other Items';

        if (!acc[categoryId]) {
          acc[categoryId] = {
            category_id: item.category?._id,
            category_name: categoryName,
            category_slug: item.category?.slug,
            category_image_url: item.category?.image_url,
            display_order: item.category?.display_order || 999,
            items: []
          };
        }

        acc[categoryId].items.push({
          _id: item._id,
          name: item.name,
          slug: item.slug,
          description: item.description,
          image_url: item.image_url,
          images: item.images,
          food_type: item.food_type,
          is_veg: item.is_veg,
          price: item.price,
          original_price: item.original_price,
          discount_percentage: item.discount_percentage,
          is_available: item.is_available,
          stock_status: item.stock_status,
          preparation_time: item.preparation_time,
          spice_level: item.spice_level,
          allergens: item.allergens,
          ingredients: item.ingredients,
          cuisines: item.cuisines,
          tags: item.tags,
          calories: item.calories,
          serves: item.serves,
          avg_rating: item.avg_rating,
          total_votes: item.total_votes,
          upvote_count: item.upvote_count || 0,
          downvote_count: item.downvote_count || 0,
          post_count: item.post_count || 0,
          order_count: item.order_count,
          is_featured: item.is_featured,
          is_recommended: item.is_recommended,
          is_bestseller: item.is_bestseller,
          is_signature: item.is_signature,
          is_new: item.is_new,
          addons: item.addons || [],
          variants: item.variants || []
        });

        return acc;
      }, {});

      formattedMenu = Object.values(grouped).sort((a: any, b: any) => a.display_order - b.display_order);
    } else {
      // Flat list for search/special sorting
      formattedMenu = menuItems.map(item => ({
        _id: item._id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        image_url: item.image_url,
        images: item.images,
        food_type: item.food_type,
        is_veg: item.is_veg,
        category: item.category,
        price: item.price,
        original_price: item.original_price,
        discount_percentage: item.discount_percentage,
        is_available: item.is_available,
        stock_status: item.stock_status,
        preparation_time: item.preparation_time,
        spice_level: item.spice_level,
        allergens: item.allergens,
        ingredients: item.ingredients,
        cuisines: item.cuisines,
        tags: item.tags,
        calories: item.calories,
        serves: item.serves,
        avg_rating: item.avg_rating,
        total_votes: item.total_votes,
        upvote_count: item.upvote_count || 0,
        downvote_count: item.downvote_count || 0,
        post_count: item.post_count || 0,
        order_count: item.order_count,
        is_featured: item.is_featured,
        is_recommended: item.is_recommended,
        is_bestseller: item.is_bestseller,
        is_signature: item.is_signature,
        is_new: item.is_new,
        addons: item.addons || [],
        variants: item.variants || []
      }));
    }

    res.json({
      status: true,
      data: {
        outlet: {
          _id: outlet._id,
          name: outlet.name,
          brand: outlet.brand_id,
          address: outlet.address,
          contact: outlet.contact
        },
        menu: formattedMenu,
        combos: formattedCombos,
        total_items: menuItems.length,
        total_combos: combos.length
      }
    });
  } catch (error: any) {
    console.error('Error fetching outlet menu:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to fetch outlet menu'
    });
  }
};

/**
 * Update food item at outlet (NEW: Direct update, no junction table)
 * PATCH /api/v1/outlets/:outletId/menu/:foodItemId
 */
export const updateOutletMenuItem = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId, foodItemId } = req.params;
    const updateData = req.body;

    // Verify outlet exists
    const outlet = await Outlet.findById(outletId);
    if (!outlet) {
      return res.status(404).json({
        status: false,
        message: 'Outlet not found'
      });
    }

    // Check if user is owner/manager
    // TODO: Add proper authorization check

    // Find and update food item
    const foodItem = await FoodItem.findOne({
      _id: foodItemId,
      outlet_id: outletId
    });

    if (!foodItem) {
      return res.status(404).json({
        status: false,
        message: 'Food item not found'
      });
    }

    // Update fields (only allowed fields)
    const allowedUpdates = [
      'is_available',
      'stock_status',
      'stock_quantity',
      'price',
      'discount_percentage',
      'display_order',
      'is_featured',
      'is_bestseller',
      'is_signature',
      'is_new',
      'preparation_time',
      'description',
      'images',
      'tags'
    ];

    Object.keys(updateData).forEach(key => {
      if (allowedUpdates.includes(key)) {
        (foodItem as any)[key] = updateData[key];
      }
    });

    await foodItem.save();

    res.json({
      status: true,
      data: foodItem,
      message: 'Food item updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating food item:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to update food item'
    });
  }
};

/**
 * Bulk reorder menu items
 * POST /api/v1/outlets/:outletId/menu/reorder
 * Body: { items: [{ menu_item_id, display_order }] }
 */
export const reorderOutletMenu = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        status: false,
        message: 'Items array is required'
      });
    }

    // Verify outlet
    const outlet = await Outlet.findById(outletId);
    if (!outlet) {
      return res.status(404).json({
        status: false,
        message: 'Outlet not found'
      });
    }

    // Bulk update
    const outletObjectId = new mongoose.Types.ObjectId(outletId);

    const bulkOps = items.map((item: any) => ({
      updateOne: {
        filter: {
          _id: item.menu_item_id,
          outlet_id: outletObjectId
        },
        update: {
          $set: { display_order: item.display_order }
        }
      }
    }));

    const result = await OutletMenuItem.bulkWrite(bulkOps);

    res.json({
      status: true,
      data: {
        modified: result.modifiedCount,
        matched: result.matchedCount
      },
      message: 'Menu order updated successfully'
    });
  } catch (error: any) {
    console.error('Error reordering menu:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to reorder menu'
    });
  }
};

/**
 * Get menu categories for outlet
 * GET /api/v1/outlets/:outletId/menu/categories
 */
export const getOutletMenuCategories = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;

    // Verify outlet
    const outlet = await Outlet.findById(outletId);
    if (!outlet) {
      return res.status(404).json({
        status: false,
        message: 'Outlet not found'
      });
    }

    // Get all menu items with categories
    const menuItems = await OutletMenuItem.find({
      outlet_id: outletId,
      is_available: true
    })
      .populate({
        path: 'food_item_id',
        populate: { path: 'category_id' }
      })
      .lean();

    // Group by category
    const categoriesMap = new Map();

    menuItems.forEach((item: any) => {
      const category = item.food_item_id?.category_id;
      if (category) {
        if (!categoriesMap.has(category._id.toString())) {
          categoriesMap.set(category._id.toString(), {
            _id: category._id,
            name: category.name,
            slug: category.slug,
            items_count: 0
          });
        }
        const cat = categoriesMap.get(category._id.toString());
        cat.items_count++;
      }
    });

    const categories = Array.from(categoriesMap.values());

    res.json({
      status: true,
      data: categories
    });
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to fetch categories'
    });
  }
};

/**
 * Toggle menu item availability quickly
 * PATCH /api/v1/outlets/:outletId/menu/:menuItemId/toggle
 */
export const toggleMenuItemAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId, menuItemId } = req.params;

    const menuItem = await OutletMenuItem.findOne({
      _id: menuItemId,
      outlet_id: outletId
    });

    if (!menuItem) {
      return res.status(404).json({
        status: false,
        message: 'Menu item not found'
      });
    }

    // Toggle availability
    menuItem.is_available = !menuItem.is_available;
    menuItem.last_stock_update = new Date();
    await menuItem.save();

    res.json({
      status: true,
      data: {
        is_available: menuItem.is_available
      },
      message: `Item ${menuItem.is_available ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error: any) {
    console.error('Error toggling availability:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to toggle availability'
    });
  }
};
