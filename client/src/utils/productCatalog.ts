export interface ProductCategoryDefinition {
  name: string;
  subcategories: string[];
}

export const PRODUCT_CATEGORIES: ProductCategoryDefinition[] = [
  { name: 'Tablets', subcategories: ['Regular', 'Chewable', 'Dispersible', 'Effervescent', 'Sublingual', 'Buccal', 'Enteric-Coated', 'Sustained/Extended Release'] },
  { name: 'Capsules', subcategories: ['Hard Gelatin', 'Softgel', 'Enteric-Coated', 'Modified/Extended Release'] },
  { name: 'Syrups & Oral Liquids', subcategories: ['Syrup', 'Suspension', 'Oral Solution', 'Dry Syrup', 'Drops', 'Elixir', 'Linctus'] },
  { name: 'Sachets & Powders', subcategories: ['Sachet', 'Granules', 'ORS', 'Electrolyte Powder', 'Medicinal Powder'] },
  { name: 'Injections', subcategories: ['Ampoule', 'Vial', 'Prefilled Syringe', 'Powder for Injection', 'IM', 'IV', 'SC'] },
  { name: 'IV Fluids', subcategories: ['Normal Saline', 'Dextrose', 'Ringer Lactate', 'DNS', 'Dextrose-Saline', 'Mannitol', 'Other IV Solutions'] },
  { name: 'Eye Products', subcategories: ['Eye Drops', 'Eye Ointment', 'Eye Gel', 'Artificial Tears'] },
  { name: 'Ear Products', subcategories: ['Ear Drops', 'Ear Solutions'] },
  { name: 'Nasal Products', subcategories: ['Nasal Drops', 'Nasal Spray', 'Saline Spray'] },
  { name: 'Oral / Throat Products', subcategories: ['Mouthwash', 'Gargle', 'Throat Spray', 'Lozenges', 'Oral Gel'] },
  { name: 'Topical Medicines', subcategories: ['Cream', 'Ointment', 'Gel', 'Lotion', 'Paste', 'Powder', 'Solution', 'Liniment'] },
  { name: 'Sprays', subcategories: ['Throat Spray', 'Nasal Spray', 'Skin Spray', 'Antiseptic Spray', 'Pain Spray'] },
  { name: 'Inhalation & Respiratory', subcategories: ['Inhaler', 'Rotacap', 'Nebule/Respule', 'Nebulizer Solution', 'Spacer'] },
  { name: 'Suppositories & Rectal', subcategories: ['Suppository', 'Enema', 'Rectal Cream/Ointment'] },
  { name: 'Vaginal / Gynaecology', subcategories: ['Vaginal Tablet', 'Pessary', 'Vaginal Cream/Gel', 'Vaginal Wash'] },
  { name: 'Milk & Infant Formula', subcategories: ['Stage 1', 'Stage 2', 'Stage 3/Growing-Up Milk', 'Premature/Special Formula', 'Lactose-Free'] },
  { name: 'Nutrition & Supplements', subcategories: ['Multivitamins', 'Minerals', 'Calcium', 'Iron', 'Vitamin D', 'Protein', 'Nutritional Drinks', 'Pregnancy Supplements'] },
  { name: 'Baby Care', subcategories: ['Feeding Bottles', 'Nipples/Teats', 'Pacifiers', 'Baby Lotion', 'Baby Oil', 'Baby Shampoo', 'Baby Soap', 'Baby Powder'] },
  { name: 'Diapers / Pampers', subcategories: ['Newborn', 'Small', 'Medium', 'Large', 'XL', 'XXL', 'Pants', 'Adult Diapers'] },
  { name: 'Cosmetics & Beauty', subcategories: ['Face Cream', 'Moisturizer', 'Cleanser', 'Face Wash', 'Bleach', 'Facial Kit', 'Face Mask', 'Serum', 'Scrub', 'Makeup'] },
  { name: 'Skin Care / Dermocosmetics', subcategories: ['Sunscreen', 'Acne Care', 'Whitening/Brightening', 'Anti-Aging', 'Dry-Skin Care', 'Lip Care'] },
  { name: 'Hair Care', subcategories: ['Shampoo', 'Conditioner', 'Hair Oil', 'Hair Serum', 'Hair Color/Dye', 'Hair Treatment'] },
  { name: 'Personal Hygiene', subcategories: ['Soap', 'Handwash', 'Sanitizer', 'Body Wash', 'Deodorant', 'Talcum Powder'] },
  { name: 'Feminine Hygiene', subcategories: ['Sanitary Pads', 'Panty Liners', 'Intimate Wash', 'Maternity Pads'] },
  { name: 'Dental / Oral Care', subcategories: ['Toothpaste', 'Toothbrush', 'Mouthwash', 'Dental Floss', 'Denture Products', 'Oral Gel'] },
  { name: 'Contraceptive / Family Planning', subcategories: ['Condoms', 'Pregnancy Tests', 'Ovulation Tests'] },
  { name: 'Syringes & Needles', subcategories: ['1 mL', '2/3 mL', '5 mL', '10 mL', '20 mL', '50/60 mL', 'Insulin Syringe', 'Needle'] },
  { name: 'IV Administration', subcategories: ['IV Set', 'Blood Set', 'Burette Set', 'Extension Line', 'Three-Way Stopcock'] },
  { name: 'IV Cannulas', subcategories: ['14G', '16G', '18G', '20G', '22G', '24G', '26G'] },
  { name: 'Catheters & Tubes', subcategories: ['Foley Catheter', 'Nelaton Catheter', "NG/Ryle's Tube", 'Feeding Tube', 'Suction Catheter'] },
  { name: 'Wound Care / Dressing', subcategories: ['Cotton', 'Gauze', 'Bandage', 'Crepe Bandage', 'Surgical Tape', 'Dressing Pad', 'Plaster', 'Sterile Dressing'] },
  { name: 'Surgical & Disposable', subcategories: ['Gloves', 'Masks', 'Surgical Caps', 'Shoe Covers', 'Disposable Gowns', 'Examination Sheets'] },
  { name: 'Antiseptics & Disinfectants', subcategories: ['Spirit', 'Povidone-Iodine', 'Chlorhexidine', 'Hydrogen Peroxide', 'Surface Disinfectant'] },
  { name: 'Medical Devices', subcategories: ['BP Monitor', 'Glucometer', 'Thermometer', 'Pulse Oximeter', 'Nebulizer'] },
  { name: 'Diabetes Care', subcategories: ['Glucometer Strips', 'Lancets', 'Insulin Pen', 'Pen Needles', 'Insulin Syringes'] },
  { name: 'Orthopedic / Support', subcategories: ['Knee Support', 'Ankle Support', 'Wrist Support', 'Cervical Collar', 'Lumbar Belt'] },
  { name: 'First Aid', subcategories: ['First-Aid Kit', 'Hot/Cold Pack', 'Burn Dressing', 'Emergency Supplies'] },
  { name: 'Sexual Wellness', subcategories: ['Lubricants', 'Pregnancy/Fertility Testing Products'] },
  { name: 'Herbal / Unani', subcategories: ['Herbal Tablets/Capsules', 'Syrups', 'Oils', 'Powders', 'Herbal Supplements'] },
  { name: 'General / FMCG', subcategories: ['Water', 'Beverages', 'Snacks', 'Tissues', 'Other Non-Pharmacy Retail Products'] }
];

export const getSubcategories = (categoryName: string): string[] =>
  PRODUCT_CATEGORIES.find(category => category.name === categoryName)?.subcategories || [];
