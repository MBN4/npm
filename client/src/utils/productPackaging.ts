export type PackagingType = 'MULTI_TIER' | 'SIMPLE';

export interface ProductPackagingProfile {
  packagingType: PackagingType;
  unit: string;
  unitPlural: string;
  middle: string;
  middlePlural: string;
  outer: string;
  outerPlural: string;
}

const profiles: Record<string, ProductPackagingProfile> = {
  tablet: { packagingType: 'MULTI_TIER', unit: 'Tablet', unitPlural: 'Tablets', middle: 'Pack', middlePlural: 'Packs', outer: 'Box', outerPlural: 'Boxes' },
  capsule: { packagingType: 'MULTI_TIER', unit: 'Capsule', unitPlural: 'Capsules', middle: 'Pack', middlePlural: 'Packs', outer: 'Box', outerPlural: 'Boxes' },
  syrup: { packagingType: 'SIMPLE', unit: 'Bottle', unitPlural: 'Bottles', middle: '', middlePlural: '', outer: 'Carton', outerPlural: 'Cartons' },
  injection: { packagingType: 'SIMPLE', unit: 'Vial / Ampoule', unitPlural: 'Vials / Ampoules', middle: '', middlePlural: '', outer: 'Box', outerPlural: 'Boxes' },
  cream: { packagingType: 'SIMPLE', unit: 'Tube / Jar', unitPlural: 'Tubes / Jars', middle: '', middlePlural: '', outer: 'Box', outerPlural: 'Boxes' },
  drops: { packagingType: 'SIMPLE', unit: 'Dropper Bottle', unitPlural: 'Dropper Bottles', middle: '', middlePlural: '', outer: 'Box', outerPlural: 'Boxes' },
  inhaler: { packagingType: 'SIMPLE', unit: 'Inhaler / Respule', unitPlural: 'Inhalers / Respules', middle: '', middlePlural: '', outer: 'Box', outerPlural: 'Boxes' },
  sachet: { packagingType: 'SIMPLE', unit: 'Sachet', unitPlural: 'Sachets', middle: '', middlePlural: '', outer: 'Box', outerPlural: 'Boxes' }
};

export const getProductPackaging = (dosageForm?: string, stockUnit?: string | null): ProductPackagingProfile => {
  const profile = profiles[String(dosageForm || 'Tablet').toLowerCase()] || {
    packagingType: 'SIMPLE' as const,
    unit: 'Unit',
    unitPlural: 'Units',
    middle: '',
    middlePlural: '',
    outer: 'Box',
    outerPlural: 'Boxes'
  };

  if (!stockUnit) return profile;
  return { ...profile, unit: stockUnit, unitPlural: stockUnit.endsWith('s') ? stockUnit : `${stockUnit}s` };
};
