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

const simple = (unit: string, unitPlural: string, outer = 'Box', outerPlural = 'Boxes'): ProductPackagingProfile => ({
  packagingType: 'SIMPLE', unit, unitPlural, middle: '', middlePlural: '', outer, outerPlural
});

export const getProductPackaging = (dosageForm?: string, stockUnit?: string | null, categoryName?: string): ProductPackagingProfile => {
  const form = String(dosageForm || '').toLowerCase();
  const category = String(categoryName || '').toLowerCase();
  let profile = profiles[form];

  if (!profile && (category === 'tablets' || category === 'capsules' || form.includes('tablet') || form.includes('capsule'))) {
    profile = category === 'capsules' || form.includes('capsule') ? profiles.capsule : profiles.tablet;
  } else if (!profile && category.includes('syrup')) profile = simple('Bottle', 'Bottles', 'Carton', 'Cartons');
  else if (!profile && category.includes('sachet')) profile = simple('Sachet', 'Sachets');
  else if (!profile && category === 'injections') {
    if (form.includes('ampoule')) profile = simple('Ampoule', 'Ampoules');
    else if (form.includes('syringe')) profile = simple('Prefilled Syringe', 'Prefilled Syringes');
    else profile = simple('Vial', 'Vials');
  } else if (!profile && category === 'iv fluids') profile = simple('Bottle / Bag', 'Bottles / Bags', 'Carton', 'Cartons');
  else if (!profile && category.includes('eye products')) profile = form.includes('ointment') || form.includes('gel') ? simple('Tube', 'Tubes') : simple('Dropper Bottle', 'Dropper Bottles');
  else if (!profile && (category.includes('ear products') || category.includes('nasal products'))) profile = simple('Bottle', 'Bottles');
  else if (!profile && category.includes('oral / throat')) profile = form.includes('lozenge') ? simple('Lozenge', 'Lozenges') : form.includes('gel') ? simple('Tube', 'Tubes') : simple('Bottle', 'Bottles');
  else if (!profile && category === 'topical medicines') profile = ['lotion', 'solution', 'liniment'].some(x => form.includes(x)) ? simple('Bottle', 'Bottles') : form.includes('powder') ? simple('Container', 'Containers') : simple('Tube / Jar', 'Tubes / Jars');
  else if (!profile && category === 'sprays') profile = simple('Spray Bottle', 'Spray Bottles');
  else if (!profile && category.includes('inhalation')) profile = form.includes('rotacap') ? simple('Rotacap', 'Rotacaps') : form.includes('respule') || form.includes('nebule') ? simple('Respule', 'Respules') : form.includes('solution') ? simple('Bottle', 'Bottles') : simple('Inhaler / Device', 'Inhalers / Devices');
  else if (!profile && category.includes('suppositories')) profile = form.includes('enema') ? simple('Bottle', 'Bottles') : form.includes('cream') ? simple('Tube', 'Tubes') : simple('Suppository', 'Suppositories');
  else if (!profile && category.includes('vaginal')) profile = form.includes('wash') ? simple('Bottle', 'Bottles') : form.includes('cream') || form.includes('gel') ? simple('Tube', 'Tubes') : simple('Pessary', 'Pessaries');
  else if (!profile && category.includes('milk')) profile = simple('Tin / Pack', 'Tins / Packs', 'Carton', 'Cartons');
  else if (!profile && category.includes('nutrition')) profile = form.includes('drink') || form.includes('protein') ? simple('Tin / Bottle', 'Tins / Bottles', 'Carton', 'Cartons') : simple('Bottle / Pack', 'Bottles / Packs', 'Carton', 'Cartons');
  else if (!profile && category === 'baby care') profile = ['lotion', 'oil', 'shampoo'].some(x => form.includes(x)) ? simple('Bottle', 'Bottles', 'Carton', 'Cartons') : form.includes('soap') ? simple('Bar', 'Bars') : form.includes('powder') ? simple('Container', 'Containers') : simple('Piece', 'Pieces');
  else if (!profile && category.includes('diaper')) profile = simple('Pack', 'Packs', 'Carton', 'Cartons');
  else if (!profile && category.includes('cosmetics')) profile = ['cream', 'moisturizer', 'serum', 'scrub', 'bleach'].some(x => form.includes(x)) ? simple('Tube / Jar', 'Tubes / Jars') : form.includes('wash') || form.includes('cleanser') ? simple('Bottle', 'Bottles') : simple('Item / Pack', 'Items / Packs');
  else if (!profile && category.includes('skin care')) profile = form.includes('lip') ? simple('Stick / Tube', 'Sticks / Tubes') : simple('Tube / Bottle', 'Tubes / Bottles');
  else if (!profile && category === 'hair care') profile = form.includes('color') ? simple('Kit / Pack', 'Kits / Packs') : simple('Bottle', 'Bottles', 'Carton', 'Cartons');
  else if (!profile && category === 'personal hygiene') profile = form.includes('soap') ? simple('Bar', 'Bars') : form.includes('powder') ? simple('Container', 'Containers') : simple('Bottle', 'Bottles', 'Carton', 'Cartons');
  else if (!profile && category === 'feminine hygiene') profile = form.includes('wash') ? simple('Bottle', 'Bottles') : simple('Pack', 'Packs', 'Carton', 'Cartons');
  else if (!profile && category.includes('dental')) profile = form.includes('toothpaste') || form.includes('gel') ? simple('Tube', 'Tubes') : form.includes('mouthwash') ? simple('Bottle', 'Bottles') : form.includes('toothbrush') ? simple('Piece', 'Pieces') : simple('Pack', 'Packs');
  else if (!profile && category.includes('contraceptive')) profile = form.includes('condom') ? simple('Pack', 'Packs') : simple('Test Kit', 'Test Kits');
  else if (!profile && (category.includes('syringes') || category.includes('iv administration') || category.includes('iv cannulas') || category.includes('catheters'))) profile = simple('Piece', 'Pieces');
  else if (!profile && category.includes('wound care')) profile = simple('Piece / Pack', 'Pieces / Packs');
  else if (!profile && category.includes('surgical')) profile = simple('Piece / Pack', 'Pieces / Packs', 'Carton', 'Cartons');
  else if (!profile && category.includes('antiseptics')) profile = simple('Bottle', 'Bottles', 'Carton', 'Cartons');
  else if (!profile && category === 'medical devices') profile = simple('Device', 'Devices');
  else if (!profile && category === 'diabetes care') profile = form.includes('strip') || form.includes('needle') || form.includes('lancet') ? simple('Piece', 'Pieces') : simple('Device', 'Devices');
  else if (!profile && category.includes('orthopedic')) profile = simple('Piece', 'Pieces');
  else if (!profile && category === 'first aid') profile = form.includes('kit') ? simple('Kit', 'Kits') : simple('Piece / Pack', 'Pieces / Packs');
  else if (!profile && category === 'sexual wellness') profile = form.includes('lubricant') ? simple('Tube / Bottle', 'Tubes / Bottles') : simple('Test Kit', 'Test Kits');
  else if (!profile && category.includes('herbal')) profile = form.includes('syrup') || form.includes('oil') ? simple('Bottle', 'Bottles') : form.includes('powder') ? simple('Container', 'Containers') : simple('Unit', 'Units');
  else if (!profile && category.includes('fmcg')) profile = form.includes('water') || form.includes('beverage') ? simple('Bottle / Can', 'Bottles / Cans', 'Carton', 'Cartons') : simple('Pack / Item', 'Packs / Items', 'Carton', 'Cartons');

  profile ||= {
    packagingType: 'SIMPLE' as const,
    unit: 'Item',
    unitPlural: 'Items',
    middle: '',
    middlePlural: '',
    outer: 'Box',
    outerPlural: 'Boxes'
  };

  if (!stockUnit) return profile;
  return { ...profile, unit: stockUnit, unitPlural: stockUnit.endsWith('s') ? stockUnit : `${stockUnit}s` };
};
