import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:4000';

const test = async () => {
    try {

        // 1. Auth: Send OTP
        const sendOtpRes = await axios.post(`${API_URL}/v1/auth/otp/send`, {
            phone: '1234567890'
        });

        // 2. Auth: Verify OTP
        const verifyOtpRes = await axios.post(`${API_URL}/v1/auth/otp/verify`, {
            phone: '1234567890',
            otp: '123456'
        });
        const token = verifyOtpRes.data.token;
        const userId = verifyOtpRes.data.user.id;

        const authHeader = { headers: { Authorization: `Bearer ${token}` } };

        // 3. Brands: Search Brands
        const searchBrandsRes = await axios.get(`${API_URL}/v1/brands`);
        const brands = searchBrandsRes.data.data;
        if (!brands || !Array.isArray(brands)) {
            throw new Error('Brands response is not an array');
        }
        const pizzaHub = brands.find((b: any) => b.slug === 'pizza-hub');
        const brandId = pizzaHub ? pizzaHub._id : null;

        if (brandId) {

            // 4. Menu: List Categories
            const categoriesRes = await axios.get(`${API_URL}/v1/brands/${brandId}/categories`);

            // 5. Menu: List Food Items
            const foodItemsRes = await axios.get(`${API_URL}/v1/brands/${brandId}/food-items`);

            // 6. Menu: List Menus
            const menusRes = await axios.get(`${API_URL}/v1/brands/${brandId}/menus`);
        }

        // 7. Brands: Create a New Brand
        const newBrandRes = await axios.post(`${API_URL}/v1/brands`, {
            name: 'Burger King',
            logoUrl: 'https://example.com/bk.png',
            description: 'Flame grilled burgers',
            cuisines: ['American', 'Fast Food']
        }, authHeader);

        // 8. Outlets: Create a New Outlet
        if (brandId) {
            const newOutletRes = await axios.post(`${API_URL}/v1/outlets`, {
                brandId: brandId,
                name: 'Pizza Hub Uptown',
                address: {
                    city: 'New York',
                    country: 'USA'
                }
            }, authHeader);
            const outletId = newOutletRes.data.id;

            // 9. Outlets: Get Profile Overview
            const overviewRes = await axios.get(`${API_URL}/v1/outlets/${outletId}/profile/overview`);
        }

    } catch (error: any) {
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Error Data:', error.response.data);
        } else {
            console.error('Error Message:', error.message);
        }
        process.exit(1);
    }
};

test();
