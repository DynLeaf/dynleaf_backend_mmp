import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:4000';

const test = async () => {
    try {
        console.log('--- Starting API Demo Calls ---');

        // 1. Auth: Send OTP
        console.log('\n[1] Auth: Sending OTP');
        const sendOtpRes = await axios.post(`${API_URL}/v1/auth/otp/send`, {
            phone: '1234567890'
        });
        console.log('Response:', sendOtpRes.data);

        // 2. Auth: Verify OTP
        console.log('\n[2] Auth: Verifying OTP');
        const verifyOtpRes = await axios.post(`${API_URL}/v1/auth/otp/verify`, {
            phone: '1234567890',
            otp: '123456'
        });
        const token = verifyOtpRes.data.token;
        const userId = verifyOtpRes.data.user.id;
        console.log('Token extracted:', token.substring(0, 10) + '...');

        const authHeader = { headers: { Authorization: `Bearer ${token}` } };

        // 3. Brands: Search Brands
        console.log('\n[3] Brands: Searching Brands (Public)');
        const searchBrandsRes = await axios.get(`${API_URL}/v1/brands`);
        const brands = searchBrandsRes.data.data;
        if (!brands || !Array.isArray(brands)) {
            console.log('Unexpected response from /v1/brands:', searchBrandsRes.data);
            throw new Error('Brands response is not an array');
        }
        console.log(`Found ${brands.length} brands.`);
        const pizzaHub = brands.find((b: any) => b.slug === 'pizza-hub');
        const brandId = pizzaHub ? pizzaHub._id : null;

        if (brandId) {
            console.log('Seeded Brand ID:', brandId);

            // 4. Menu: List Categories
            console.log('\n[4] Menu: Listing Categories');
            const categoriesRes = await axios.get(`${API_URL}/v1/brands/${brandId}/categories`);
            console.log('Categories:', categoriesRes.data.map((c: any) => c.name));

            // 5. Menu: List Food Items
            console.log('\n[5] Menu: Listing Food Items');
            const foodItemsRes = await axios.get(`${API_URL}/v1/brands/${brandId}/food-items`);
            console.log('Food Items:', foodItemsRes.data.map((f: any) => f.name));

            // 6. Menu: List Menus
            console.log('\n[6] Menu: Listing Menus');
            const menusRes = await axios.get(`${API_URL}/v1/brands/${brandId}/menus`);
            console.log('Menus:', menusRes.data.map((m: any) => m.name));
        }

        // 7. Brands: Create a New Brand
        console.log('\n[7] Brands: Creating New Brand (Protected)');
        const newBrandRes = await axios.post(`${API_URL}/v1/brands`, {
            name: 'Burger King',
            logoUrl: 'https://example.com/bk.png',
            description: 'Flame grilled burgers',
            cuisines: ['American', 'Fast Food']
        }, authHeader);
        console.log('New Brand Created:', newBrandRes.data.name);

        // 8. Outlets: Create a New Outlet
        if (brandId) {
            console.log('\n[8] Outlets: Creating New Outlet (Protected)');
            const newOutletRes = await axios.post(`${API_URL}/v1/outlets`, {
                brandId: brandId,
                name: 'Pizza Hub Uptown',
                address: {
                    city: 'New York',
                    country: 'USA'
                }
            }, authHeader);
            console.log('New Outlet Created (ID):', newOutletRes.data.id);
            const outletId = newOutletRes.data.id;

            // 9. Outlets: Get Profile Overview
            console.log('\n[9] Outlets: Getting Profile Overview (Public)');
            const overviewRes = await axios.get(`${API_URL}/v1/outlets/${outletId}/profile/overview`);
            console.log('Profile Overview:', overviewRes.data.name, '-', overviewRes.data.outletId);
        }

        console.log('\n--- API Demo Calls Completed Successfully ---');
    } catch (error: any) {
        console.error('\n--- API Demo Calls Failed ---');
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
