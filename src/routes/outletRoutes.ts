import express from 'express';
import {
    createOutlet,
    getOutletById,
    getUserOutlets,
    getUserOutletsList,
    updateOutlet,
    saveCompliance,
    updateOperatingHours,
    uploadPhotoGallery,
    deletePhotoGallery,
    getProfileOverview,
    getProfileAbout,
    getBrandOutlets,
    getNearbyOutlets,
    getFeaturedOutlets,
    toggleFeaturedStatus
} from '../controllers/outletController.js';
import { protect } from '../middleware/authMiddleware.js';

import {
    updateSocialLinks,
    getProfileFeed,
    getProfilePhotos,
    getProfileReviews
} from '../controllers/socialController.js';

import {
    trackOutletProfileView,
    trackOutletMenuView,
    trackOutletVisit
} from '../controllers/outletAnalyticsController.js';

const router = express.Router();

// Public routes
router.get('/nearby', getNearbyOutlets);
router.get('/featured', getFeaturedOutlets);
router.get('/brand/:brandId/outlets', getBrandOutlets);

// Protected routes
router.post('/', protect, createOutlet);
router.get('/my-outlets', protect, getUserOutlets);
router.get('/my-outlets-list', protect, getUserOutletsList); // Lightweight for dropdown
router.get('/:outletId', protect, getOutletById);
router.put('/:outletId', protect, updateOutlet);
router.patch('/:outletId/featured', protect, toggleFeaturedStatus); // Toggle featured status
router.post('/:outletId/compliance', protect, saveCompliance);
router.put('/:outletId/operating-hours', protect, updateOperatingHours);
router.post('/:outletId/photo-gallery', protect, uploadPhotoGallery);
router.delete('/:outletId/photo-gallery', protect, deletePhotoGallery);
router.put('/:outletId/social-links', protect, updateSocialLinks);

router.get('/:outletId/profile/overview', getProfileOverview);
router.get('/:outletId/profile/about', getProfileAbout);
router.get('/:outletId/profile/feed', getProfileFeed);
router.get('/:outletId/profile/photos', getProfilePhotos);
router.get('/:outletId/profile/reviews', getProfileReviews);

// Public analytics tracking
router.post('/:outletId/analytics/profile-view', trackOutletProfileView);
router.post('/:outletId/analytics/menu-view', trackOutletMenuView);
router.post('/:outletId/analytics/outlet-visit', trackOutletVisit);


export default router;
