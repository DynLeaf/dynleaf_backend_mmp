import express from 'express';
import {
    createOutlet,
    getUserOutlets,
    updateOutlet,
    saveCompliance,
    updateOperatingHours,
    uploadPhotoGallery,
    deletePhotoGallery,
    getProfileOverview,
    getProfileAbout
} from '../controllers/outletController.js';
import { protect } from '../middleware/authMiddleware.js';

import {
    updateSocialLinks,
    getProfileFeed,
    getProfilePhotos,
    getProfileReviews
} from '../controllers/socialController.js';

const router = express.Router();

router.post('/', protect, createOutlet);
router.get('/my-outlets', protect, getUserOutlets);
router.put('/:outletId', protect, updateOutlet);
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


export default router;
