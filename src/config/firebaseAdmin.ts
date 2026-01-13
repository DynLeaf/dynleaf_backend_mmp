import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

let serviceAccount = {};
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();

        // Handle case where the string might be wrapped in quotes
        if ((jsonString.startsWith('"') && jsonString.endsWith('"')) ||
            (jsonString.startsWith("'") && jsonString.endsWith("'"))) {
            jsonString = jsonString.substring(1, jsonString.length - 1);
        }

        try {
            serviceAccount = JSON.parse(jsonString);
        } catch (parseError) {
            console.warn('Standard JSON.parse failed. Attempting deep fix for .env escaping...');
            try {
                // Step 1: Fix escaped quotes
                let fixedJson = jsonString.replace(/\\"/g, '"');

                // Step 2: Handle newlines (specifically for private_key)
                fixedJson = fixedJson.replace(/\\\\n/g, '\\n');

                // Step 3: Handle any other double backslashes
                fixedJson = fixedJson.replace(/\\\\/g, '\\');

                serviceAccount = JSON.parse(fixedJson);
                console.log('✅ Firebase service account parsed successfully after fix.');
            } catch (secondError: any) {
                console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON.');
                throw parseError;
            }
        }
    }
} catch (error) {
    console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:', error);
}

if (Object.keys(serviceAccount).length > 0) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin initialized');
    } catch (error) {
        console.error('Error initializing Firebase Admin:', error);
    }
} else {
    console.warn('FIREBASE_SERVICE_ACCOUNT_JSON not found or invalid. FCM will not work.');
}

export default admin;
