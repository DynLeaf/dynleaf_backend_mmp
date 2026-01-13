import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

let serviceAccount = {};
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
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
