/**
 * Menu Validation Utilities
 * Validates variants, addons, and combos for menu items
 */

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate menu item variants
 */
export const validateVariants = (variants: any[]): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(variants) || variants.length === 0) {
        return { isValid: true, errors, warnings };
    }

    // Check for duplicates
    const names = new Set<string>();
    variants.forEach((v, idx) => {
        const name = v.name?.toLowerCase().trim();
        if (!name) {
            errors.push(`Variant ${idx + 1}: Name is required`);
        } else if (names.has(name)) {
            errors.push(`Duplicate variant name: ${v.name}`);
        } else {
            names.add(name);
        }

        if (typeof v.price !== 'number' || v.price < 0) {
            errors.push(`Variant "${v.name}": Invalid price (${v.price})`);
        }

        if (v.price === 0) {
            warnings.push(`Variant "${v.name}": Price is 0`);
        }
    });

    // Check for default variant
    const hasDefault = variants.some(v => v.is_default);
    if (!hasDefault && variants.length > 0) {
        warnings.push('No default variant specified. First variant will be used as default.');
    }

    // Check for multiple defaults
    const defaultCount = variants.filter(v => v.is_default).length;
    if (defaultCount > 1) {
        errors.push(`Multiple default variants found (${defaultCount}). Only one default is allowed.`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

/**
 * Validate menu item addons
 */
export const validateAddons = (addons: any[]): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(addons)) {
        return { isValid: true, errors, warnings };
    }

    // Check for duplicates
    const names = new Set<string>();

    addons.forEach((addon, idx) => {
        if (!addon.name || addon.name.trim().length === 0) {
            errors.push(`Addon ${idx + 1}: Name is required`);
            return;
        }

        const name = addon.name.toLowerCase().trim();
        if (names.has(name)) {
            errors.push(`Duplicate addon name: ${addon.name}`);
        } else {
            names.add(name);
        }

        if (typeof addon.price !== 'number' || addon.price < 0) {
            errors.push(`Addon "${addon.name}": Invalid price (${addon.price})`);
        }

        if (addon.price === 0) {
            warnings.push(`Addon "${addon.name}": Price is 0`);
        }

        if (addon.max_quantity && addon.max_quantity < 1) {
            errors.push(`Addon "${addon.name}": Max quantity must be at least 1`);
        }

        if (addon.max_quantity && addon.max_quantity > 100) {
            warnings.push(`Addon "${addon.name}": Max quantity is very high (${addon.max_quantity})`);
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

/**
 * Validate combo meal
 */
export const validateCombo = (combo: any): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!combo) {
        errors.push('Combo data is required');
        return { isValid: false, errors, warnings };
    }

    // Validate items
    if (!combo.items || !Array.isArray(combo.items)) {
        errors.push('Combo must have an items array');
    } else if (combo.items.length < 2) {
        errors.push(`Combo must have at least 2 items (found ${combo.items.length})`);
    } else {
        // Validate each item
        combo.items.forEach((item: any, idx: number) => {
            if (!item.name || item.name.trim().length === 0) {
                errors.push(`Combo item ${idx + 1}: Name is required`);
            }

            if (item.quantity && (typeof item.quantity !== 'number' || item.quantity < 1)) {
                errors.push(`Combo item "${item.name}": Invalid quantity (${item.quantity})`);
            }
        });

        // Check for duplicate items
        const itemNames = new Set<string>();
        combo.items.forEach((item: any) => {
            const name = item.name?.toLowerCase().trim();
            if (name && itemNames.has(name)) {
                warnings.push(`Duplicate item in combo: ${item.name}`);
            } else if (name) {
                itemNames.add(name);
            }
        });
    }

    // Validate pricing
    if (!combo.pricing_type) {
        errors.push('Combo pricing_type is required');
    } else {
        switch (combo.pricing_type) {
            case 'fixed':
                if (!combo.combo_price || combo.combo_price <= 0) {
                    errors.push('Fixed price combo must have a valid combo_price');
                }
                break;

            case 'percentage_off':
                if (!combo.discount_percentage || combo.discount_percentage <= 0 || combo.discount_percentage > 100) {
                    errors.push('Percentage discount must be between 0 and 100');
                }
                if (combo.discount_percentage > 50) {
                    warnings.push(`High discount percentage: ${combo.discount_percentage}%`);
                }
                break;

            case 'amount_off':
                if (!combo.discount_amount || combo.discount_amount <= 0) {
                    errors.push('Amount discount must be greater than 0');
                }
                if (combo.original_price && combo.discount_amount >= combo.original_price) {
                    errors.push('Discount amount cannot be greater than or equal to original price');
                }
                break;

            default:
                errors.push(`Invalid pricing_type: ${combo.pricing_type}`);
        }
    }

    // Validate prices make sense
    if (combo.original_price && combo.final_price) {
        if (combo.final_price > combo.original_price) {
            errors.push('Final price cannot be greater than original price');
        }

        if (combo.final_price <= 0) {
            errors.push('Final price must be greater than 0');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

/**
 * Normalize variant data to standard format
 */
export const normalizeVariant = (variant: any, index: number) => {
    return {
        name: String(variant.name || variant.size || '').trim(),
        price: Math.round((Number(variant.price) || 0) * 100) / 100,
        sku: variant.sku || undefined,
        is_default: variant.is_default || index === 0,
        is_available: variant.is_available !== false,
        display_order: variant.display_order ?? index
    };
};

/**
 * Normalize addon data to standard format
 */
export const normalizeAddon = (addon: any, index: number) => {
    return {
        name: String(addon.name || '').trim(),
        price: Math.round((Number(addon.price) || 0) * 100) / 100,
        category: addon.category || undefined,
        description: addon.description || undefined,
        is_default: addon.is_default || false,
        max_quantity: addon.max_quantity || 10,
        is_vegetarian: addon.is_vegetarian,
        allergens: Array.isArray(addon.allergens) ? addon.allergens : undefined,
        display_order: addon.display_order ?? index
    };
};

/**
 * Normalize combo data to standard format
 */
export const normalizeCombo = (combo: any) => {
    const items = Array.isArray(combo.items)
        ? combo.items.map((item: any) => ({
            name: String(item.name || '').trim(),
            quantity: Number(item.quantity) || 1,
            variant_name: item.variant_name || undefined,
            is_customizable: item.is_customizable !== false
        }))
        : [];

    return {
        items,
        pricing_type: combo.pricing_type || 'fixed',
        combo_price: combo.combo_price ? Math.round(combo.combo_price * 100) / 100 : undefined,
        discount_percentage: combo.discount_percentage || undefined,
        discount_amount: combo.discount_amount ? Math.round(combo.discount_amount * 100) / 100 : undefined,
        original_price: combo.original_price ? Math.round(combo.original_price * 100) / 100 : undefined,
        final_price: combo.final_price ? Math.round(combo.final_price * 100) / 100 : undefined
    };
};

/**
 * Validate and clean all menu item data
 */
export const validateMenuItem = (item: any): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!item.name || item.name.trim().length === 0) {
        errors.push('Item name is required');
    }

    if (typeof item.price !== 'number' || item.price < 0) {
        errors.push('Invalid item price');
    }

    if (!item.category || item.category.trim().length === 0) {
        warnings.push('Item category is missing');
    }

    // Validate variants
    if (item.variants && item.variants.length > 0) {
        const variantValidation = validateVariants(item.variants);
        errors.push(...variantValidation.errors);
        warnings.push(...variantValidation.warnings);
    }

    // Validate addons
    if (item.addons && item.addons.length > 0) {
        const addonValidation = validateAddons(item.addons);
        errors.push(...addonValidation.errors);
        warnings.push(...addonValidation.warnings);
    }

    // Validate combo
    if (item.isCombo) {
        const comboData = {
            items: item.comboItems?.map((name: string) => ({ name, quantity: 1 })),
            pricing_type: 'fixed',
            combo_price: item.price
        };
        const comboValidation = validateCombo(comboData);
        errors.push(...comboValidation.errors);
        warnings.push(...comboValidation.warnings);
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};
