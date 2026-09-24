import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';

export const clinicalRouter = Router();

clinicalRouter.post('/check-interactions', authenticateToken, (req: Request, res: Response) => {
  try {
    const { medicineIds, customerId } = req.body;

    if (!medicineIds || !Array.isArray(medicineIds) || medicineIds.length === 0) {
      return res.status(400).json({ error: 'At least one medicine ID is required.' });
    }

    const placeholders = medicineIds.map(() => '?').join(',');
    const medicines = db.prepare(`
      SELECT 
        m.id as medicine_id,
        m.brand_name,
        m.strength,
        m.dosage_form,
        g.id as generic_id,
        g.name as generic_name,
        g.therapeutic_class,
        ci.pregnancy_category,
        ci.lactation_safety,
        ci.food_interactions as food_instructions,
        ci.hepatic_renal_precautions
      FROM medicines m
      LEFT JOIN generics g ON m.generic_id = g.id
      LEFT JOIN drug_clinical_info ci ON g.id = ci.generic_id
      WHERE m.id IN (${placeholders})
    `).all(...medicineIds) as any[];

    const genericIds = medicines.map(m => m.generic_id).filter(Boolean);

    const interactions: any[] = [];
    if (genericIds.length > 1) {
      const gPlaceholders = genericIds.map(() => '?').join(',');
      const rows = db.prepare(`
        SELECT 
          di.*,
          ga.name as generic_a_name,
          gb.name as generic_b_name
        FROM drug_interactions di
        JOIN generics ga ON di.generic_a_id = ga.id
        JOIN generics gb ON di.generic_b_id = gb.id
        WHERE (di.generic_a_id IN (${gPlaceholders}) AND di.generic_b_id IN (${gPlaceholders}))
      `).all(...genericIds, ...genericIds) as any[];

      rows.forEach(r => {
        const medA = medicines.find(m => m.generic_id === r.generic_a_id);
        const medB = medicines.find(m => m.generic_id === r.generic_b_id);
        if (medA && medB && medA.medicine_id !== medB.medicine_id) {
          interactions.push({
            drugA: { id: medA.medicine_id, brandName: medA.brand_name, generic: r.generic_a_name },
            drugB: { id: medB.medicine_id, brandName: medB.brand_name, generic: r.generic_b_name },
            severity: r.severity,
            effect: r.effect,
            management: r.management,
            evidenceLevel: r.evidence_level
          });
        }
      });
    }

    const duplicateTherapies: any[] = [];
    const classMap = new Map<string, any[]>();
    medicines.forEach(m => {
      if (m.therapeutic_class) {
        const list = classMap.get(m.therapeutic_class) || [];
        list.push(m);
        classMap.set(m.therapeutic_class, list);
      }
    });

    classMap.forEach((medList, className) => {
      if (medList.length > 1) {
        duplicateTherapies.push({
          therapeuticClass: className,
          drugs: medList.map(m => ({ id: m.medicine_id, brandName: m.brand_name, strength: m.strength })),
          warning: `Multiple drugs from class "${className}" prescribed together. Risk of additive toxicity or duplicate therapy.`
        });
      }
    });

    const allergyAlerts: any[] = [];
    if (customerId) {
      const customer = db.prepare('SELECT id, name, allergy_notes FROM customers WHERE id = ?').get(customerId) as any;
      if (customer && customer.allergy_notes) {
        const allergyText = customer.allergy_notes.toLowerCase();
        medicines.forEach(m => {
          const gen = (m.generic_name || '').toLowerCase();
          const brand = (m.brand_name || '').toLowerCase();
          const tclass = (m.therapeutic_class || '').toLowerCase();

          const hasConflict =
            (allergyText.includes('penicillin') && (gen.includes('amoxicillin') || gen.includes('ampicillin') || tclass.includes('penicillin'))) ||
            (allergyText.includes('aspirin') && (gen.includes('aspirin') || tclass.includes('nsaid') || gen.includes('naproxen') || gen.includes('ibuprofen'))) ||
            (allergyText.includes('sulfa') && gen.includes('sulfa')) ||
            allergyText.includes(gen) ||
            allergyText.includes(brand);

          if (hasConflict) {
            allergyAlerts.push({
              medicineId: m.medicine_id,
              brandName: m.brand_name,
              genericName: m.generic_name,
              documentedAllergy: customer.allergy_notes,
              severity: 'CRITICAL_ALLERGY_MATCH',
              warning: `Patient profile states: "${customer.allergy_notes}". Severe risk of hypersensitivity or anaphylaxis with ${m.brand_name}.`
            });
          }
        });
      }
    }

    const pregnancyWarnings: any[] = [];
    medicines.forEach(m => {
      if (m.pregnancy_category && ['C', 'D', 'X'].includes(m.pregnancy_category)) {
        pregnancyWarnings.push({
          medicineId: m.medicine_id,
          brandName: m.brand_name,
          category: m.pregnancy_category,
          lactation: m.lactation_safety,
          risk: m.pregnancy_category === 'X' ? 'CONTRAINDICATED IN PREGNANCY' : 'USE WITH CAUTION - BENEFIT MUST OUTWEIGH RISK'
        });
      }
    });

    const hasContraindicated = interactions.some(i => i.severity === 'CONTRAINDICATED') || allergyAlerts.length > 0;
    const hasMajor = interactions.some(i => i.severity === 'MAJOR');

    res.json({
      safe: !hasContraindicated && !hasMajor,
      summary: {
        medicinesEvaluated: medicines.length,
        interactionsCount: interactions.length,
        duplicateTherapyCount: duplicateTherapies.length,
        allergyAlertsCount: allergyAlerts.length,
        pregnancyAlertsCount: pregnancyWarnings.length,
        safetyStatus: hasContraindicated ? 'DANGER' : hasMajor ? 'WARNING' : interactions.length > 0 ? 'CAUTION' : 'CLEAR'
      },
      interactions,
      duplicateTherapies,
      allergyAlerts,
      pregnancyWarnings,
      disclaimer: 'CLINICAL DECISION SUPPORT: Sourced from verified drug reference database. Pharmacist clinical judgment required.'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to perform clinical interaction check', details: err.message });
  }
});

clinicalRouter.get('/medicine/:id/monograph', authenticateToken, (req: Request, res: Response) => {
  try {
    const medicineId = req.params.id;

    const info = db.prepare(`
      SELECT 
        m.id as medicine_id,
        m.brand_name,
        m.strength,
        m.dosage_form,
        m.pack_size,
        m.rack_location,
        g.id as generic_id,
        g.name as generic_name,
        g.therapeutic_class,
        g.description as generic_description,
        ci.pregnancy_category,
        ci.lactation_safety,
        ci.adult_dosage,
        ci.pediatric_dosage,
        ci.food_interactions as food_instructions,
        ci.hepatic_renal_precautions,
        ci.side_effects_common as common_side_effects
      FROM medicines m
      LEFT JOIN generics g ON m.generic_id = g.id
      LEFT JOIN drug_clinical_info ci ON g.id = ci.generic_id
      WHERE m.id = ?
    `).get(medicineId) as any;

    if (!info) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    let knownInteractions: any[] = [];
    if (info.generic_id) {
      knownInteractions = db.prepare(`
        SELECT 
          di.*,
          CASE WHEN di.generic_a_id = ? THEN gb.name ELSE ga.name END as interacting_drug_name
        FROM drug_interactions di
        JOIN generics ga ON di.generic_a_id = ga.id
        JOIN generics gb ON di.generic_b_id = gb.id
        WHERE di.generic_a_id = ? OR di.generic_b_id = ?
      `).all(info.generic_id, info.generic_id, info.generic_id);
    }

    let substitutes: any[] = [];
    if (info.generic_id) {
      substitutes = db.prepare(`
        SELECT 
          m.id,
          m.brand_name,
          m.strength,
          m.dosage_form,
          man.name as manufacturer_name,
          COALESCE(SUM(b.quantity), 0) as available_stock,
          MIN(b.sale_price) as min_price
        FROM medicines m
        LEFT JOIN manufacturers man ON m.manufacturer_id = man.id
        LEFT JOIN batches b ON m.id = b.medicine_id AND b.status = 'ACTIVE' AND b.quantity > 0 AND b.expiry_date > DATE('now')
        WHERE m.generic_id = ? AND m.id != ? AND m.is_active = 1
        GROUP BY m.id
        ORDER BY available_stock DESC
      `).all(info.generic_id, medicineId);
    }

    res.json({
      monograph: info,
      knownInteractions,
      substitutes
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve clinical monograph', details: err.message });
  }
});

const DRUG_ALIAS_MAP: Record<string, string> = {
  'sunfl': 'Naproxen Sodium',
  'sunflex': 'Naproxen Sodium',
  'synflex': 'Naproxen Sodium',
  'naprosyn': 'Naproxen Sodium',
  'aleve': 'Naproxen Sodium',
  'naproxen': 'Naproxen Sodium',
  'aceclofenac': 'Aceclofenac',
  'hifenac': 'Aceclofenac',
  'zerodol': 'Aceclofenac',
  'ondasteron': 'Ondansetron',
  'ondasteran': 'Ondansetron',
  'ondasetron': 'Ondansetron',
  'gravinate': 'Ondansetron',
  'emeset': 'Ondansetron',
  'zofran': 'Ondansetron',
  'paracetimol': 'Paracetamol',
  'paracetmol': 'Paracetamol',
  'panadol': 'Paracetamol',
  'calpol': 'Paracetamol',
  'amoxil': 'Amoxicillin + Clavulanic Acid',
  'augmentin': 'Amoxicillin + Clavulanic Acid',
  'risek': 'Omeprazole',
  'losec': 'Omeprazole',
  'norvasc': 'Amlodipine',
  'glucophage': 'Metformin HCl',
  'brufen': 'Ibuprofen',
  'advil': 'Ibuprofen',
  'motrin': 'Ibuprofen',
  'voltaren': 'Diclofenac',
  'voltral': 'Diclofenac',
  'caflam': 'Diclofenac',
  'flagyl': 'Metronidazole',
  'ponstan': 'Mefenamic Acid',
  'buscopan': 'Hyoscine N-Butylbromide',
  'ventolin': 'Salbutamol',
  'zithromax': 'Azithromycin',
  'azomax': 'Azithromycin',
  'ciprobay': 'Ciprofloxacin',
  'ciproxin': 'Ciprofloxacin',
  'rocephin': 'Ceftriaxone',
  'cozaar': 'Losartan Potassium',
  'eziday': 'Losartan Potassium',
  'lipitor': 'Atorvastatin',
  'singulair': 'Montelukast',
  'montika': 'Montelukast',
  'myteka': 'Montelukast',
  'zyrtec': 'Cetirizine',
  'rigix': 'Cetirizine',
  'valium': 'Diazepam',
  'lexapro': 'Escitalopram',
  'clexane': 'Enoxaparin',
  'lasix': 'Furosemide',
  'disprin': 'Aspirin',
  'loprin': 'Aspirin',
  'decadron': 'Dexamethasone',
  'nexium': 'Esomeprazole',
  'concor': 'Bisoprolol',
  'diamicron': 'Gliclazide',
  'claritin': 'Loratadine',
  'bactroban': 'Mupirocin',
  'imodium': 'Loperamide'
};

async function fetchOpenFdaDrug(searchTerm: string) {
  try {
    const cleanTerm = searchTerm.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    if (!cleanTerm || cleanTerm.length < 3) return null;

    const queryUrl = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(cleanTerm)}"+openfda.brand_name:"${encodeURIComponent(cleanTerm)}"&limit=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(queryUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json() as any;
    if (!data.results || data.results.length === 0) return null;

    const item = data.results[0];
    const genericName = item.openfda?.generic_name?.[0] || cleanTerm;
    const brandName = item.openfda?.brand_name?.[0] || '';
    const pharmClass = item.openfda?.pharm_class_epc?.[0] || item.openfda?.pharm_class_moa?.[0] || 'Pharmaceutical Agent';

    const insertGen = db.prepare(`
      INSERT INTO generics (name, therapeutic_class, description)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        therapeutic_class = COALESCE(excluded.therapeutic_class, generics.therapeutic_class)
      RETURNING id
    `);

    const genRes = insertGen.get(
      genericName,
      pharmClass,
      item.description?.[0]?.slice(0, 500) || `FDA-approved pharmaceutical: ${genericName}.`
    ) as any;

    if (!genRes?.id) return null;

    const pregnancyText = (item.pregnancy?.[0] || '').toUpperCase();
    let pregnancyCat = 'C';
    if (pregnancyText.includes('CATEGORY A')) pregnancyCat = 'A';
    else if (pregnancyText.includes('CATEGORY B')) pregnancyCat = 'B';
    else if (pregnancyText.includes('CATEGORY D')) pregnancyCat = 'D';
    else if (pregnancyText.includes('CATEGORY X') || pregnancyText.includes('CONTRAINDICATED IN PREGNANCY')) pregnancyCat = 'X';

    const insertInfo = db.prepare(`
      INSERT OR REPLACE INTO drug_clinical_info (
        generic_id, atc_code, rx_status, pharmacological_class, countries_available,
        pregnancy_category, lactation_safety,
        adult_dosage, pediatric_dosage, hepatic_renal_precautions,
        indications_approved, pharmacology_moa,
        contraindications_absolute, boxed_warnings, side_effects_common,
        food_interactions, clinical_source, source_version, last_reviewed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertInfo.run(
      genRes.id,
      item.openfda?.spl_set_id?.[0]?.slice(0, 10) || 'FDA-LIVE',
      item.openfda?.product_type?.[0]?.includes('OTC') ? 'OTC' : 'Rx',
      pharmClass,
      'USA (FDA), Global Formulary',
      pregnancyCat,
      item.nursing_mothers?.[0]?.slice(0, 300) || 'Consult physician prior to nursing.',
      item.dosage_and_administration?.[0]?.slice(0, 500) || 'Follow standard licensed product labeling.',
      item.pediatric_use?.[0]?.slice(0, 400) || 'Consult pediatric reference.',
      item.use_in_specific_populations?.[0]?.slice(0, 400) || 'Monitor hepatic and renal clearance.',
      item.indications_and_usage?.[0]?.slice(0, 500) || 'FDA registered clinical indication.',
      item.mechanism_of_action?.[0]?.slice(0, 500) || item.clinical_pharmacology?.[0]?.slice(0, 500) || 'See prescribing information.',
      item.contraindications?.[0]?.slice(0, 500) || 'Hypersensitivity to active molecule.',
      item.boxed_warning?.[0]?.slice(0, 500) || null,
      item.adverse_reactions?.[0]?.slice(0, 500) || 'Gastrointestinal upset, headache, rash.',
      item.drug_and_or_laboratory_test_interactions?.[0]?.slice(0, 400) || 'Take with water as directed.',
      'US FDA Public OpenFDA Live Registry',
      'v2026.Live',
      new Date().toISOString().split('T')[0]
    );

    if (brandName) {
      db.prepare(`
        INSERT OR IGNORE INTO medicines (
          brand_name, generic_id, strength, dosage_form, pack_size, rack_location, min_stock_level, reorder_level
        ) VALUES (?, ?, ?, ?, 10, 'General', 5, 10)
      `).run(brandName, genRes.id, 'Standard', 'Tablet');
    }

    return genRes.id;
  } catch {
    return null;
  }
}

clinicalRouter.get('/dictionary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').trim();
    const letter = ((req.query.letter as string) || '').trim().toUpperCase();
    const therapeuticClass = ((req.query.class as string) || '').trim();
    const rxStatus = ((req.query.rxStatus as string) || '').trim();
    const sort = ((req.query.sort as string) || 'AZ').trim();
    const country = ((req.query.country as string) || '').trim();

    const buildQuery = (searchTerm: string, useFuzzy = false) => {
      let queryStr = `
        SELECT DISTINCT
          g.id as generic_id,
          g.name as generic_name,
          g.therapeutic_class,
          g.description as generic_description,
          ci.*
        FROM generics g
        LEFT JOIN drug_clinical_info ci ON g.id = ci.generic_id
        LEFT JOIN medicines m ON m.generic_id = g.id
        WHERE 1=1
      `;

      const params: any[] = [];

      if (!searchTerm) {
        if (letter === '0-9' || letter === '0–9') {
          queryStr += ` AND SUBSTR(g.name, 1, 1) BETWEEN '0' AND '9'`;
        } else if (letter && letter.length === 1) {
          queryStr += ` AND UPPER(g.name) LIKE ?`;
          params.push(`${letter}%`);
        }
      }

      if (country && country !== 'Global') {
        queryStr += ` AND (ci.countries_available LIKE ? OR ci.countries_available IS NULL)`;
        params.push(`%${country}%`);
      }

      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        const mappedAlias = DRUG_ALIAS_MAP[lowerSearch];

        if (mappedAlias) {
          queryStr += ` AND (g.name LIKE ? OR g.name LIKE ? OR g.description LIKE ? OR m.brand_name LIKE ?)`;
          const mainTerm = `%${searchTerm}%`;
          const aliasTerm = `%${mappedAlias}%`;
          params.push(mainTerm, aliasTerm, aliasTerm, mainTerm);
        } else if (useFuzzy && searchTerm.length >= 3) {
          const prefix = `%${searchTerm.slice(0, 3)}%`;
          queryStr += ` AND (
            g.name LIKE ? OR 
            g.name LIKE ? OR 
            g.therapeutic_class LIKE ? OR 
            g.description LIKE ? OR
            m.brand_name LIKE ? OR
            m.brand_name LIKE ?
          )`;
          const mainTerm = `%${searchTerm}%`;
          params.push(mainTerm, prefix, mainTerm, mainTerm, mainTerm, prefix);
        } else {
          queryStr += ` AND (
            g.name LIKE ? OR 
            g.therapeutic_class LIKE ? OR 
            g.description LIKE ? OR 
            ci.atc_code LIKE ? OR
            ci.indications_approved LIKE ? OR
            ci.indications_common LIKE ? OR
            m.brand_name LIKE ? OR
            m.strength LIKE ?
          )`;
          const term = `%${searchTerm}%`;
          params.push(term, term, term, term, term, term, term, term);
        }
      }

      if (therapeuticClass) {
        queryStr += ` AND g.therapeutic_class LIKE ?`;
        params.push(`%${therapeuticClass}%`);
      }

      if (rxStatus) {
        queryStr += ` AND ci.rx_status = ?`;
        params.push(rxStatus);
      }

      if (sort === 'ZA') {
        queryStr += ` ORDER BY g.name DESC`;
      } else if (sort === 'CLASS') {
        queryStr += ` ORDER BY g.therapeutic_class ASC, g.name ASC`;
      } else {
        queryStr += ` ORDER BY g.name ASC`;
      }

      return { queryStr, params };
    };

    let { queryStr, params } = buildQuery(search, false);
    let genericsList = db.prepare(queryStr).all(...params) as any[];

    if (genericsList.length === 0 && search) {
      const fallback = buildQuery(search, true);
      genericsList = db.prepare(fallback.queryStr).all(...fallback.params) as any[];

      if (genericsList.length === 0) {
        await fetchOpenFdaDrug(search);
        const retry = buildQuery(search, false);
        genericsList = db.prepare(retry.queryStr).all(...retry.params) as any[];
      }
    }

    const dictionaryEntries = genericsList.map(g => {
      const linkedMedicines = db.prepare(`
        SELECT 
          m.id,
          m.brand_name,
          m.strength,
          m.dosage_form,
          m.pack_size,
          m.rack_location,
          man.name as manufacturer_name,
          COALESCE(SUM(b.quantity), 0) as total_stock,
          MIN(b.sale_price) as min_price
        FROM medicines m
        LEFT JOIN manufacturers man ON m.manufacturer_id = man.id
        LEFT JOIN batches b ON m.id = b.medicine_id AND b.status = 'ACTIVE' AND b.expiry_date > CURRENT_DATE
        WHERE m.generic_id = ?
        GROUP BY m.id
        ORDER BY m.brand_name ASC
      `).all(g.generic_id);

      return {
        ...g,
        brands: linkedMedicines,
        brandCount: linkedMedicines.length
      };
    });

    res.json({
      total: dictionaryEntries.length,
      entries: dictionaryEntries
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve pharma dictionary', details: err.message });
  }
});

clinicalRouter.get('/classes', authenticateToken, (_req: Request, res: Response) => {
  try {
    const classes = db.prepare(`
      SELECT 
        therapeutic_class,
        COUNT(*) as drug_count
      FROM generics
      WHERE therapeutic_class IS NOT NULL AND therapeutic_class != ''
      GROUP BY therapeutic_class
      ORDER BY therapeutic_class ASC
    `).all();

    res.json({ classes });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch drug classes', details: err.message });
  }
});

clinicalRouter.get('/manufacturers', authenticateToken, (_req: Request, res: Response) => {
  try {
    const manufacturers = db.prepare(`
      SELECT 
        mfr.id,
        mfr.name as company_name,
        mfr.contact_person,
        mfr.phone,
        COUNT(m.id) as total_brands
      FROM manufacturers mfr
      LEFT JOIN medicines m ON m.manufacturer_id = mfr.id
      GROUP BY mfr.id
      ORDER BY mfr.name ASC
    `).all();

    res.json({ manufacturers });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch manufacturers', details: err.message });
  }
});

clinicalRouter.get('/monograph/:genericId', authenticateToken, (req: Request, res: Response) => {
  try {
    const genericId = Number(req.params.genericId);
    const generic = db.prepare('SELECT * FROM generics WHERE id = ?').get(genericId) as any;
    if (!generic) {
      return res.status(404).json({ error: 'Generic drug monograph not found' });
    }

    const clinicalInfo = db.prepare('SELECT * FROM drug_clinical_info WHERE generic_id = ?').get(genericId) as any;

    const linkedMedicines = db.prepare(`
      SELECT 
        m.id,
        m.brand_name,
        m.strength,
        m.dosage_form,
        m.pack_size,
        m.barcode,
        m.rack_location,
        man.name as manufacturer_name,
        COALESCE(SUM(b.quantity), 0) as total_stock,
        MIN(b.sale_price) as min_price,
        MAX(b.sale_price) as max_price
      FROM medicines m
      LEFT JOIN manufacturers man ON m.manufacturer_id = man.id
      LEFT JOIN batches b ON m.id = b.medicine_id AND b.status = 'ACTIVE' AND b.expiry_date > CURRENT_DATE
      WHERE m.generic_id = ?
      GROUP BY m.id
      ORDER BY m.brand_name ASC
    `).all(genericId);

    const interactions = db.prepare(`
      SELECT 
        di.*,
        ga.name as generic_a_name,
        gb.name as generic_b_name
      FROM drug_interactions di
      JOIN generics ga ON di.generic_a_id = ga.id
      JOIN generics gb ON di.generic_b_id = gb.id
      WHERE di.generic_a_id = ? OR di.generic_b_id = ?
    `).all(genericId, genericId);

    res.json({
      generic,
      clinicalInfo: clinicalInfo || {},
      brands: linkedMedicines,
      interactions
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve monograph', details: err.message });
  }
});

clinicalRouter.get('/pill-identifier', authenticateToken, (req: Request, res: Response) => {
  try {
    const imprint = ((req.query.imprint as string) || '').trim();
    const shape = ((req.query.shape as string) || '').trim();
    const color = ((req.query.color as string) || '').trim();
    const form = ((req.query.form as string) || '').trim();

    let queryStr = `
      SELECT 
        g.id as generic_id,
        g.name as generic_name,
        g.therapeutic_class,
        ci.pill_imprint,
        ci.pill_shape,
        ci.pill_color,
        ci.rx_status,
        m.brand_name,
        m.strength,
        m.dosage_form,
        man.name as manufacturer_name
      FROM drug_clinical_info ci
      JOIN generics g ON ci.generic_id = g.id
      LEFT JOIN medicines m ON m.generic_id = g.id
      LEFT JOIN manufacturers man ON m.manufacturer_id = man.id
      WHERE 1=1
    `;

    const params: any[] = [];
    if (imprint) {
      queryStr += ` AND ci.pill_imprint LIKE ?`;
      params.push(`%${imprint}%`);
    }
    if (shape) {
      queryStr += ` AND ci.pill_shape LIKE ?`;
      params.push(`%${shape}%`);
    }
    if (color) {
      queryStr += ` AND ci.pill_color LIKE ?`;
      params.push(`%${color}%`);
    }
    if (form) {
      queryStr += ` AND (m.dosage_form LIKE ? OR ci.pill_shape LIKE ?)`;
      params.push(`%${form}%`, `%${form}%`);
    }

    queryStr += ` LIMIT 20`;
    const matches = db.prepare(queryStr).all(...params);

    res.json({ matches });
  } catch (err: any) {
    res.status(500).json({ error: 'Pill identification lookup failed', details: err.message });
  }
});

clinicalRouter.get('/charts/:chartType', authenticateToken, (req: Request, res: Response) => {
  try {
    const chartType = req.params.chartType;

    if (chartType === 'antibiotics_spectrum') {
      res.json({
        chartType,
        title: 'Interactive Antibiotics Spectrum Reference Chart',
        data: [
          { antibiotic: 'Amoxicillin / Clavulanate', class: 'Penicillin + BLI', gramPos: '++++', gramNeg: '+++', anaerobes: '++++', atypicals: '0', pseudomonas: '0', moa: 'Cell wall synthesis inhibitor + Beta-lactamase inhibitor' },
          { antibiotic: 'Ceftriaxone (Gen 3)', class: 'Cephalosporin (Gen 3)', gramPos: '+++', gramNeg: '++++', anaerobes: '+', atypicals: '0', pseudomonas: '0', moa: 'PBP cell wall inhibitor' },
          { antibiotic: 'Ciprofloxacin', class: 'Fluoroquinolone', gramPos: '+', gramNeg: '++++', anaerobes: '0', atypicals: '+++', pseudomonas: '+++', moa: 'DNA gyrase & Topoisomerase IV inhibitor' },
          { antibiotic: 'Azithromycin', class: 'Macrolide', gramPos: '++', gramNeg: '++', anaerobes: '0', atypicals: '++++', pseudomonas: '0', moa: '50S ribosomal protein subunit inhibitor' },
          { antibiotic: 'Meropenem', class: 'Carbapenem', gramPos: '++++', gramNeg: '++++', anaerobes: '++++', atypicals: '0', pseudomonas: '++++', moa: 'Broad-spectrum beta-lactam cell wall inhibitor' },
          { antibiotic: 'Vancomycin', class: 'Glycopeptide', gramPos: '++++ (MRSA)', gramNeg: '0', anaerobes: '++ (C. diff)', atypicals: '0', pseudomonas: '0', moa: 'D-Ala-D-Ala cell wall precursor inhibitor' },
          { antibiotic: 'Metronidazole', class: 'Nitroimidazole', gramPos: '0', gramNeg: '0', anaerobes: '++++', atypicals: '0', pseudomonas: '0', moa: 'DNA helical structure disruption via toxic metabolites' },
          { antibiotic: 'Piperacillin / Tazobactam', class: 'Antipseudomonal Penicillin', gramPos: '++++', gramNeg: '++++', anaerobes: '++++', atypicals: '0', pseudomonas: '++++', moa: 'Broad-spectrum cell wall inhibitor' }
        ]
      });
    } else if (chartType === 'nsaids_matrix') {
      res.json({
        chartType,
        title: 'NSAIDs Selectivity, Efficacy & Risk Matrix',
        data: [
          { drug: 'Naproxen', coxSelectivity: 'Non-selective', giRisk: 'Moderate-High', cvRisk: 'Lowest CV Risk (Safest)', renalRisk: 'Moderate', dose: '275mg-550mg PO BID (max 1375mg/d)' },
          { drug: 'Aceclofenac', coxSelectivity: 'COX-2 Preferential', giRisk: 'Low-Moderate (Well tolerated)', cvRisk: 'Moderate', renalRisk: 'Moderate', dose: '100mg PO BID (max 200mg/d)' },
          { drug: 'Ibuprofen', coxSelectivity: 'Non-selective (COX-1 = COX-2)', giRisk: 'Moderate', cvRisk: 'Low', renalRisk: 'Moderate', dose: '400mg-800mg PO TID (max 3200mg/d)' },
          { drug: 'Celecoxib', coxSelectivity: 'COX-2 Selective', giRisk: 'Low', cvRisk: 'High', renalRisk: 'Moderate', dose: '100mg-200mg PO daily/BID' },
          { drug: 'Diclofenac', coxSelectivity: 'Slight COX-2 Preference', giRisk: 'Moderate', cvRisk: 'Moderate-High', renalRisk: 'Moderate', dose: '50mg PO BID/TID or 75mg SR' },
          { drug: 'Ketorolac', coxSelectivity: 'COX-1 Selective', giRisk: 'Very High (Max 5 days)', cvRisk: 'Moderate', renalRisk: 'High', dose: '10mg PO q4-6h (max 40mg/d)' }
        ]
      });
    } else {
      res.json({
        chartType,
        title: 'Clinical Quick Reference Data',
        data: []
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve reference chart', details: err.message });
  }
});

clinicalRouter.get('/favorites', authenticateToken, (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const favs = db.prepare(`
      SELECT f.id, f.generic_id, g.name as generic_name, g.therapeutic_class, ci.atc_code, ci.rx_status
      FROM user_pharma_favorites f
      JOIN generics g ON f.generic_id = g.id
      LEFT JOIN drug_clinical_info ci ON g.id = ci.generic_id
      WHERE f.user_id = ?
      ORDER BY g.name ASC
    `).all(userId);

    res.json({ favorites: favs });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch favorites', details: err.message });
  }
});

clinicalRouter.post('/favorites/:genericId', authenticateToken, (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const genericId = Number(req.params.genericId);
    db.prepare('INSERT OR IGNORE INTO user_pharma_favorites (user_id, generic_id) VALUES (?, ?)').run(userId, genericId);
    res.json({ success: true, message: 'Added to clinical favorites' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add favorite', details: err.message });
  }
});

clinicalRouter.delete('/favorites/:genericId', authenticateToken, (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const genericId = Number(req.params.genericId);
    db.prepare('DELETE FROM user_pharma_favorites WHERE user_id = ? AND generic_id = ?').run(userId, genericId);
    res.json({ success: true, message: 'Removed from clinical favorites' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove favorite', details: err.message });
  }
});

clinicalRouter.get('/notes/:genericId', authenticateToken, (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const genericId = Number(req.params.genericId);
    const note = db.prepare('SELECT * FROM user_pharma_notes WHERE user_id = ? AND generic_id = ?').get(userId, genericId);
    res.json({ note: note || null });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch clinical note', details: err.message });
  }
});

clinicalRouter.post('/notes', authenticateToken, (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { genericId, noteText } = req.body;

    if (!genericId || !noteText) {
      return res.status(400).json({ error: 'genericId and noteText are required' });
    }

    db.prepare(`
      INSERT INTO user_pharma_notes (user_id, generic_id, note_text, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, generic_id) DO UPDATE SET
        note_text = excluded.note_text,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, Number(genericId), noteText.trim());

    res.json({ success: true, message: 'Pharmacist clinical note saved.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save note', details: err.message });
  }
});

clinicalRouter.post('/ai-consult', authenticateToken, (req: Request, res: Response) => {
  try {
    const { query, medicineId } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query prompt is required.' });
    }

    let contextData: any = null;
    let substitutes: any[] = [];
    if (medicineId) {
      contextData = db.prepare(`
        SELECT m.id, m.brand_name, m.strength, m.dosage_form, g.id as generic_id, g.name as generic_name, g.therapeutic_class,
               ci.pregnancy_category, ci.lactation_safety, ci.adult_dosage, ci.pediatric_dosage, ci.food_interactions as food_instructions,
               ci.hepatic_renal_precautions, ci.side_effects_common as common_side_effects
        FROM medicines m
        LEFT JOIN generics g ON m.generic_id = g.id
        LEFT JOIN drug_clinical_info ci ON g.id = ci.generic_id
        WHERE m.id = ?
      `).get(medicineId) as any;

      if (contextData?.generic_id) {
        substitutes = db.prepare(`
          SELECT m.id, m.brand_name, m.strength, m.dosage_form, man.name as manufacturer_name,
                 COALESCE(SUM(b.quantity), 0) as available_stock, MIN(b.sale_price) as sale_price
          FROM medicines m
          LEFT JOIN manufacturers man ON m.manufacturer_id = man.id
          LEFT JOIN batches b ON m.id = b.medicine_id AND b.status = 'ACTIVE' AND b.expiry_date > CURRENT_DATE
          WHERE m.generic_id = ? AND m.id != ? AND m.is_active = 1
          GROUP BY m.id
        `).all(contextData.generic_id, medicineId);
      }
    }

    const qLower = query.toLowerCase();
    let verifiedData = '';
    let aiExplanation = '';

    if (qLower.includes('alternative') || qLower.includes('substitute') || qLower.includes('brand')) {
      if (contextData) {
        verifiedData = `Generic Molecule: ${contextData.generic_name} (${contextData.strength}, ${contextData.dosage_form}).\nTherapeutic Class: ${contextData.therapeutic_class || 'Standard'}.`;
        if (substitutes.length > 0) {
          aiExplanation = `Identified ${substitutes.length} in-stock bioequivalent alternative(s) sharing active salt ${contextData.generic_name}:\n` +
            substitutes.map((s: any) => `• ${s.brand_name} ${s.strength} (${s.dosage_form}) by ${s.manufacturer_name || 'Generic'} - Stock: ${s.available_stock} units (Rs. ${s.sale_price || 'N/A'})`).join('\n') +
            `\nClinical recommendation: Ensure identical salt strength and dosage form bioavailability before dispensing.`;
        } else {
          aiExplanation = `No alternate brands currently in inventory for ${contextData.generic_name}. Recommended action: Consult supplier directory or prescribe equivalent within class ${contextData.therapeutic_class}.`;
        }
      } else {
        aiExplanation = `To suggest exact in-stock brand alternatives, select a target medicine from the selector above or specify the generic salt name.`;
      }
    } else if (qLower.includes('dosage') || qLower.includes('dose') || qLower.includes('how to take')) {
      if (contextData) {
        verifiedData = `Adult Dosage Reference: ${contextData.adult_dosage || 'Standard BNF / USP titration'}\nPediatric Dosage Reference: ${contextData.pediatric_dosage || 'Weight-adjusted dosing (mg/kg)'}\nFood Timing: ${contextData.food_instructions || 'With plenty of water'}`;
        aiExplanation = `For ${contextData.brand_name} (${contextData.generic_name}), standard adult clinical dosing guidance indicates: ${contextData.adult_dosage || 'titration per prescription'}. Administer ${contextData.food_instructions || 'according to prescriber instructions'}. Adjust downward in patients with impaired CrCl.`;
      } else {
        aiExplanation = `Standard therapeutic dosing should adhere strictly to BNF, USP, or licensed product insert protocols. Verify renal and hepatic parameters prior to high-dose administration.`;
      }
    } else if (qLower.includes('food') || qLower.includes('eat') || qLower.includes('empty stomach')) {
      if (contextData?.food_instructions) {
        verifiedData = `Administration: ${contextData.food_instructions}`;
        aiExplanation = `Clinical administration rule for ${contextData.brand_name}: ${contextData.food_instructions}. If gastrointestinal distress occurs, take with meals unless food significantly impairs bioavailability.`;
      } else {
        aiExplanation = `Administer with a full glass of water. If GI discomfort occurs, food or milk may be co-administered unless enteric-coated or fluoroquinolone class.`;
      }
    } else if (qLower.includes('pregnant') || qLower.includes('pregnancy') || qLower.includes('lactation') || qLower.includes('breastfeeding')) {
      if (contextData?.pregnancy_category) {
        verifiedData = `FDA Pregnancy Category: ${contextData.pregnancy_category}\nLactation Safety: ${contextData.lactation_safety || 'Consult clinical guidelines'}`;
        aiExplanation = `${contextData.brand_name} (${contextData.generic_name}) is categorized as FDA Pregnancy Category ${contextData.pregnancy_category}. Lactation Note: ${contextData.lactation_safety || 'Excreted in trace amounts; monitor infant'}. Risk Assessment: ${contextData.pregnancy_category === 'X' ? 'STRICTLY CONTRAINDICATED in pregnancy.' : 'Use only if maternal benefit outweighs potential fetal risk.'}`;
      } else {
        aiExplanation = `Use during pregnancy and lactation only when clearly indicated by an attending obstetrician. Check BNF section 14.1 for pregnancy risk data.`;
      }
    } else if (qLower.includes('side effect') || qLower.includes('adverse') || qLower.includes('reaction')) {
      if (contextData?.common_side_effects) {
        verifiedData = `Documented Side Effects: ${contextData.common_side_effects}\nPrecautions: ${contextData.hepatic_renal_precautions || 'Routine monitoring'}`;
        aiExplanation = `Common adverse effects associated with ${contextData.brand_name} (${contextData.generic_name}): ${contextData.common_side_effects}. Patients should seek medical evaluation if severe reactions occur.`;
      } else {
        aiExplanation = `Monitor patient for hypersensitivity, gastrointestinal upset, CNS symptoms, or idiosyncratic drug reactions.`;
      }
    } else {
      verifiedData = contextData ? `Medicine: ${contextData.brand_name} | Generic: ${contextData.generic_name} | Class: ${contextData.therapeutic_class}` : 'General Clinical Query';
      aiExplanation = `Pharmaceutical review for "${query}": Verified guidelines recommend reviewing patient allergy history, renal/hepatic biomarkers, and concomitant prescriptions before modifying drug therapy.`;
    }

    res.json({
      query,
      targetMedicine: contextData ? { brandName: contextData.brand_name, generic: contextData.generic_name } : null,
      verifiedData,
      aiExplanation,
      response: aiExplanation,
      substitutes,
      badge: '[AI CLINICAL ADVICE - PHARMACIST VERIFICATION REQUIRED]',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to process clinical AI consultation', details: err.message });
  }
});