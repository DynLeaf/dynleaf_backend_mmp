import mongoose from "mongoose";
import * as adminDeleteRepo from "../repositories/adminDeleteRepository.js";
import * as outletRepo from "../repositories/outletRepository.js";
import * as brandRepo from "../repositories/brandRepository.js";

export const deleteOutlet = async (id: string): Promise<{ success: boolean; message: string; status: number }> => {
    const outlet = await outletRepo.findById(id);
    if (!outlet) {
      return { success: false, message: "Outlet not found", status: 404 };
    }

    await adminDeleteRepo.cascadeDeleteOutlet(new mongoose.Types.ObjectId(id));
    return { success: true, message: "Outlet permanently deleted", status: 200 };
};

export const deleteBrand = async (id: string): Promise<{ success: boolean; message: string; status: number }> => {
    const brand = await brandRepo.findById(id);
    if (!brand) {
      return { success: false, message: "Brand not found", status: 404 };
    }

    const brandOid = new mongoose.Types.ObjectId(id);

    // 1. Cascade-delete every outlet under this brand sequentially
    const outlets = await outletRepo.findOutletIdsByBrand(id);
    for (const outletId of outlets) {
      await adminDeleteRepo.cascadeDeleteOutlet(outletId);
    }

    // 2. Delete brand-level data in parallel
    await adminDeleteRepo.deleteBrandCollections(brandOid);

    // 3. Delete the brand document itself
    await adminDeleteRepo.deleteBrandDoc(brandOid);

    return { success: true, message: "Brand and all related data permanently deleted", status: 200 };
};
