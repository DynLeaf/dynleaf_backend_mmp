import { Request, Response } from 'express';
import { Outlet } from '../models/Outlet.js';
import { FoodItem } from '../models/FoodItem.js';
import { OutletMenuItem } from '../models/OutletMenuItem.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

/**
 * Get outlet's menu with all items
 * GET /api/v1/outlets/:outletId/menu
 * Query params: category, isVeg, isAvailable, search, sortBy
 */
export const getOutletMenu = async (req: Request, res: Response) => {
  try {
    const { outletId } = req.params;
    const { category, isVeg, isAvailable, search, sortBy = 'display_order' } = req.query;

    // Verify outlet exists
    const outlet = await Outlet.findById(outletId).populate('brand_id', 'name logo_url cuisines');
    if (!outlet) {
      return res.status(404).json({
        status: false,
        message: 'Outlet not found'
      });
    }

    // Build query for OutletMenuItem
    const query: any = { outlet_id: outletId };
    
    if (isAvailable === 'true') {
      query.is_available = true;
    }

    // Get outlet menu items with populated food items
    let menuItems = await OutletMenuItem.find(query)
      .populate({
        path: 'food_item_id',
        populate: { path: 'category_id', select: 'name slug' }
      })
      .lean();

    // Filter by category
    if (category) {
      menuItems = menuItems.filter((item: any) => 
        item.food_item_id?.category_id?.slug === category ||
        item.food_item_id?.category_id?.name === category
      );
    }

    // Filter by veg
    if (isVeg === 'true') {
      menuItems = menuItems.filter((item: any) => item.food_item_id?.is_veg === true);
    } else if (isVeg === 'false') {
      menuItems = menuItems.filter((item: any) => item.food_item_id?.is_veg === false);
    }

    // Search filter
    if (search) {
      const searchLower = (search as string).toLowerCase();
      menuItems = menuItems.filter((item: any) => 
        item.food_item_id?.name?.toLowerCase().includes(searchLower) ||
        item.food_item_id?.description?.toLowerCase().includes(searchLower) ||
        item.food_item_id?.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower))
      );
    }

    // Sort
    if (sortBy === 'price_low') {
      menuItems.sort((a: any, b: any) => {
        const priceA = a.price_override || a.food_item_id?.base_price || 0;
        const priceB = b.price_override || b.food_item_id?.base_price || 0;
        return priceA - priceB;
      });
    } else if (sortBy === 'price_high') {
      menuItems.sort((a: any, b: any) => {
        const priceA = a.price_override || a.food_item_id?.base_price || 0;
        const priceB = b.price_override || b.food_item_id?.base_price || 0;
        return priceB - priceA;
      });
    } else if (sortBy === 'popular') {
      menuItems.sort((a: any, b: any) => b.orders_at_outlet - a.orders_at_outlet);
    } else {
      // Default: display_order
      menuItems.sort((a: any, b: any) => a.display_order - b.display_order);
    }

    // Format response
    const formattedMenu = menuItems.map((item: any) => ({
      _id: item._id,
      food_item_id: item.food_item_id?._id,
      name: item.food_item_id?.name,
      description: item.food_item_id?.description,
      image_url: item.food_item_id?.image_url,
      images: item.food_item_id?.images,
      is_veg: item.food_item_id?.is_veg,
      category: item.food_item_id?.category_id,
      
      // Pricing (outlet-specific or base)
      price: item.price_override || item.food_item_id?.base_price,
      base_price: item.food_item_id?.base_price,
      discount: item.discount_override || item.food_item_id?.discount_percentage,
      
      // Availability
      is_available: item.is_available,
      stock_status: item.stock_status,
      
      // Engagement
      orders: item.orders_at_outlet,
      rating: item.rating_at_outlet,
      votes: item.votes_at_outlet,
      
      // Other details
      preparation_time: item.preparation_time_override || item.food_item_id?.preparation_time,
      spice_level: item.food_item_id?.spice_level,
      allergens: item.food_item_id?.allergens,
      calories: item.food_item_id?.calories,
      tags: item.food_item_id?.tags,
      
      is_featured: item.is_featured_at_outlet,
      display_order: item.display_order,
      custom_note: item.custom_note
    }));

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
        total_items: formattedMenu.length
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
 * Update outlet menu item (availability, price, order)
 * PATCH /api/v1/outlets/:outletId/menu/:menuItemId
 */
export const updateOutletMenuItem = async (req: AuthRequest, res: Response) => {
  try {
    const { outletId, menuItemId } = req.params;
    const {
      is_available,
      stock_status,
      price_override,
      discount_override,
      display_order,
      is_featured_at_outlet,
      preparation_time_override,
      custom_note
    } = req.body;

    // Verify outlet exists and user has access
    const outlet = await Outlet.findById(outletId);
    if (!outlet) {
      return res.status(404).json({
        status: false,
        message: 'Outlet not found'
      });
    }

    // Check if user is owner/manager
    // TODO: Add proper authorization check

    // Find and update menu item
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

    // Update fields
    if (is_available !== undefined) {
      menuItem.is_available = is_available;
      menuItem.last_stock_update = new Date();
    }
    if (stock_status) menuItem.stock_status = stock_status;
    if (price_override !== undefined) menuItem.price_override = price_override;
    if (discount_override !== undefined) menuItem.discount_override = discount_override;
    if (display_order !== undefined) menuItem.display_order = display_order;
    if (is_featured_at_outlet !== undefined) menuItem.is_featured_at_outlet = is_featured_at_outlet;
    if (preparation_time_override !== undefined) menuItem.preparation_time_override = preparation_time_override;
    if (custom_note !== undefined) menuItem.custom_note = custom_note;

    await menuItem.save();

    res.json({
      status: true,
      data: menuItem,
      message: 'Menu item updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating menu item:', error);
    res.status(500).json({
      status: false,
      message: error.message || 'Failed to update menu item'
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
    const bulkOps = items.map((item: any) => ({
      updateOne: {
        filter: {
          _id: item.menu_item_id,
          outlet_id: outletId
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
