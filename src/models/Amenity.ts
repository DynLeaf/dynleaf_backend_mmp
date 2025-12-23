import mongoose from 'mongoose';

const amenitySchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true }
});

export const Amenity = mongoose.model('Amenity', amenitySchema);

const outletAmenitySchema = new mongoose.Schema({
    outlet_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', required: true },
    amenity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Amenity', required: true }
}, { timestamps: { createdAt: 'created_at' } });

export const OutletAmenity = mongoose.model('OutletAmenity', outletAmenitySchema);
