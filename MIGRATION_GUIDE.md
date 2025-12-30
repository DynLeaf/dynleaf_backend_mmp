# Migration to Outlet-Centric Architecture

## What Changed

### Models

#### FoodItem Model
**BEFORE:**
- `brand_id` - Food items belonged to brands
- `base_price` - Single base price
- Brand-level engagement metrics

**AFTER:**
- `outlet_id` - Food items now belong directly to outlets
- `price` - Direct price (no need for overrides)
- `location` - Copied from outlet for geospatial queries
- `food_type` - More specific than just `is_veg` ('veg', 'non-veg', 'egg', 'vegan')
- Outlet-level engagement metrics
- Additional fields: `stock_status`, `stock_quantity`, `availability_schedule`, `ingredients`, etc.

#### Category Model
**BEFORE:**
- `brand_id` - Categories belonged to brands

**AFTER:**
- `outlet_id` - Categories now belong to outlets
- `display_order` - For custom ordering
- `icon_url`, `color` - Additional customization
- Compound unique index: `(outlet_id, slug)`

#### Removed
- ❌ **OutletMenuItem** junction table completely removed
- No more price_override, no more outlet-specific availability in separate table
- Everything is now direct on FoodItem

### Controllers

#### outletMenuController.ts
- `getOutletMenu()` - Now queries FoodItem directly by `outlet_id`
- Returns menu grouped by categories or flat list
- No more OutletMenuItem populates
- Simplified aggregation pipeline

#### brandOutletController.ts
- `getOutletDetail()` - Updated to query FoodItem and Category directly
- Available items count from FoodItem
- Categories with counts from FoodItem aggregation

#### foodSearchController.ts
- `getTrendingDishesNew()` - Updated to use FoodItem.location for geospatial
- Queries FoodItem directly instead of OutletMenuItem
- Uses `order_count` instead of `orders_at_outlet`

### Benefits

1. **Simpler Architecture**
   - No junction table complexity
   - Direct queries, no joins
   - Clear ownership model

2. **Better Performance**
   - Fewer database queries
   - Direct geospatial queries on FoodItem
   - Easier to cache

3. **More Scalable**
   - Can shard by `outlet_id` easily
   - Each outlet is independent
   - Horizontal scaling ready

4. **Greater Flexibility**
   - Each outlet complete autonomy
   - Can customize everything
   - No brand-level constraints

## Running the Migration

### Prerequisites
1. Backup your database
2. Ensure backend server is stopped
3. Review the migration script

### Steps

1. **Backup Database**
```bash
mongodump --uri="mongodb://localhost:27017/dynleaf" --out=./backup-$(date +%Y%m%d)
```

2. **Run Migration Script**
```bash
cd backend
npm run migrate:outlet-centric
# or
npx tsx src/scripts/migrateToOutletCentric.ts
```

3. **Verify Migration**
```bash
# Check counts
mongosh dynleaf --eval "db.fooditems.countDocuments({outlet_id: {\$exists: true}})"
mongosh dynleaf --eval "db.categories.countDocuments({outlet_id: {\$exists: true}})"
```

4. **Test APIs**
```bash
# Start backend
npm run dev

# Test endpoints
curl http://localhost:5005/v1/outlets/{outletId}/menu
curl http://localhost:5005/v1/outlets/{outletId}/detail
curl "http://localhost:5005/v1/food/trending?latitude=11.2588&longitude=75.7804"
```

5. **Clean Up Old Collections** (ONLY after thorough testing)
```bash
# DANGER: This deletes data. Only run after confirming migration success
mongosh dynleaf --eval "db.outletmenuitems.drop()"

# Optional: Drop old brand-level collections if no longer needed
# mongosh dynleaf --eval "db.oldcollectionname.drop()"
```

6. **Clear Caches**
```bash
# If using Redis
redis-cli FLUSHALL
```

### Rollback Plan

If something goes wrong:

1. **Stop the application**
2. **Restore from backup**
```bash
mongorestore --uri="mongodb://localhost:27017/dynleaf" ./backup-YYYYMMDD/dynleaf
```
3. **Revert code changes**
```bash
git checkout HEAD~1
```

## API Changes

### Menu API

**BEFORE:**
```json
{
  "status": true,
  "data": {
    "menu": [
      {
        "_id": "outletMenuItem_id",
        "food_item_id": "foodItem_id",
        "price": 180,  // price_override or base_price
        "is_available": true
      }
    ]
  }
}
```

**AFTER:**
```json
{
  "status": true,
  "data": {
    "menu": [
      {
        "category_name": "Burgers",
        "items": [
          {
            "_id": "foodItem_id",
            "name": "Zinger Burger",
            "price": 180,  // Direct price
            "is_available": true,
            "food_type": "non-veg",
            "outlet_id": "..."
          }
        ]
      }
    ]
  }
}
```

### Trending Dishes API

**Query Changed:**
```
// OLD
/menu/trending-dishes

// NEW  
/food/trending?latitude=LAT&longitude=LNG
```

**Response Structure:**
```json
{
  "status": true,
  "data": {
    "dishes": [
      {
        "_id": "foodItem_id",
        "name": "Biryani",
        "food_type": "non-veg",
        "order_count": 150,  // Instead of orders_at_outlet
        "outlet": { ... }
      }
    ]
  }
}
```

## Testing Checklist

- [ ] Menu displays correctly on restaurant profile
- [ ] Search/filter works
- [ ] Trending dishes show up
- [ ] Food item details load
- [ ] Categories display properly
- [ ] Geospatial queries work
- [ ] Ratings/reviews display (when implemented)
- [ ] No console errors in frontend
- [ ] No server errors in logs

## FAQ

**Q: What happens to existing OutletMenuItem data?**
A: The migration script reads it and creates new FoodItem records with all the outlet-specific data (price, availability, etc.)

**Q: Can I rollback?**
A: Yes, restore from backup and revert code changes.

**Q: Do I need to update the frontend?**
A: Minimal changes needed. The restaurantService already handles the new structure.

**Q: What about brands with multiple outlets?**
A: Each outlet gets its own copy of the food items. They're independent now.

**Q: How do ratings work now?**
A: Each FoodItem has its own `avg_rating` and `total_votes` for that specific outlet.

## Support

If you encounter issues:
1. Check the migration script logs
2. Verify database indexes are created
3. Check API response formats
4. Look for console/server errors
5. Restore from backup if needed

## Next Steps After Migration

1. **Update Admin Panel** - If you have an admin panel, update it to manage outlet-level menus
2. **Update Mobile App** - If applicable, update API calls
3. **Add New Features** - Now you can add outlet-specific features more easily
4. **Optimize** - Add Redis caching for menu data
5. **Monitor** - Watch server logs and performance metrics
