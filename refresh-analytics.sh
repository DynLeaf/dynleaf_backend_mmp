#!/bin/bash
# Script to manually refresh analytics
# Run this whenever you want to update analytics summaries with latest events

cd "$(dirname "$0")/.."

echo "🔄 Refreshing analytics summaries..."
echo ""

npx tsx src/scripts/aggregateTodayAnalytics.ts

echo ""
echo "✅ Analytics refreshed! You can now view updated data in the admin dashboard."
echo ""
echo "📊 To view analytics:"
echo "   1. Open http://localhost:5175 (admin panel)"
echo "   2. Go to Promotions page"
echo "   3. Click the bar chart icon next to any promotion"
echo ""
