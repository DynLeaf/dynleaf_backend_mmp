export class EventCategorizer {
    static categorize(type: string): string {
        if (type.startsWith('item_') || type === 'add_to_cart' || type === 'order_created') {
            return 'food_item';
        }

        if (type === 'outlet_visit' || type === 'profile_view' || type === 'menu_view' || type === 'outlet_search' || type === 'qr_scan') {
            return 'outlet';
        }

        if (type.startsWith('promo_')) {
            return 'promotion';
        }

        if (type.startsWith('offer_')) {
            return 'offer';
        }

        if (type === 'session_start' || type === 'session_end' || type === 'heartbeat' || type === 'navigation') {
            return 'session_lifecycle';
        }

        return 'unknown';
    }
}
