import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';

export const clinicalRouter = Router();

// ==========================================
// 1. DRUG-DRUG INTERACTION & SAFETY CHECKER
// ==========================================
clinicalRouter.post('/check-interactions', authenticateToken, (req: Request, res: Response) => {
  try {
    const { medicineIds, customerId } = req.body;

    if (!medicineIds || !Array.isArray(medicineIds) || medicineIds.length === 0) {
      return res.status(400).json({ error: 'At least one medicine ID is required.' });
    }

    // 1. Fetch medicine details including generic and therapeutic class
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
        ci.food_instructions,
        ci.hepatic_renal_precautions
      FROM medicines m
      LEFT JOIN generics g ON m.generic_id = g.id
      LEFT JOIN drug_clinical_info ci ON g.id = ci.generic_id
      WHERE m.id IN (${placeholders})
    `).all(...medicineIds) as any[];

    const genericIds = medicines.map(m => m.generic_id).filter(Boolean);

    // 2. Check Database for verified Drug-Drug Interactions (pairwise)
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

      // Filter to only combinations present in our selected medicines
      rows.forEach(r => {
        const medA = medicines.find(m => m.generic_id === r.generic_a_id);
        const medB = medicines.find(m => m.generic_id === r.generic_b_id);
        if (medA && medB && medA.medicine_id !== medB.medicine_id) {
          interactions.push({
            drugA: { id: medA.medicine_id, brandName: medA.brand_name, generic: r.generic_a_name },
            drugB: { id: medB.medicine_id, brandName: medB.brand_name, generic: r.generic_b_name },
            severity: r.severity, // CONTRAINDICATED, MAJOR, MODERATE, MINOR
            effect: r.effect,
            management: r.management,
            evidenceLevel: r.evidence_level
          });
        }
      });
    }

    // 3. Duplicate Therapy / Therapeutic Class Overlap
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

    // 4. Patient Allergy Cross-Check
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
            (allergyText.includes('aspirin') && (gen.includes('aspirin') || tclass.includes('nsaid'))) ||
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

    // 5. Pregnancy & Lactation Warnings
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

// ==========================================
// 2. MEDICINE CLINICAL MONOGRAPH
// ==========================================
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
        ci.food_instructions,
        ci.hepatic_renal_precautions,
        ci.common_side_effects
      FROM medicines m
      LEFT JOIN generics g ON m.generic_id = g.id
      LEFT JOIN drug_clinical_info ci ON g.id = ci.generic_id
      WHERE m.id = ?
    `).get(medicineId) as any;

    if (!info) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    // Fetch known interactions for this medicine's generic
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

    // Fetch in-stock generic substitutes
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

// ==========================================
// 3. PHARMA DICTIONARY (COMPREHENSIVE SEARCHABLE REFERENCE)
// ==========================================
clinicalRouter.get('/dictionary', authenticateToken, (req: Request, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').trim();
    const therapeuticClass = ((req.query.class as string) || '').trim();
    const dosageForm = ((req.query.form as string) || '').trim();

    let queryStr = `
      SELECT 
        g.id as generic_id,
        g.name as generic_name,
        g.therapeutic_class,
        g.description as generic_description,
        ci.pregnancy_category,
        ci.lactation_safety,
        ci.adult_dosage,
        ci.pediatric_dosage,
        ci.food_instructions,
        ci.hepatic_renal_precautions,
        ci.common_side_effects
      FROM generics g
      LEFT JOIN drug_clinical_info ci ON g.id = ci.generic_id
      WHERE 1=1
    `;

    const params: any[] = [];
    if (search) {
      queryStr += ` AND (g.name LIKE ? OR g.therapeutic_class LIKE ? OR g.description LIKE ? OR EXISTS (
        SELECT 1 FROM medicines m WHERE m.generic_id = g.id AND (m.brand_name LIKE ? OR m.strength LIKE ?)
      ))`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (therapeuticClass) {
      queryStr += ` AND g.therapeutic_class = ?`;
      params.push(therapeuticClass);
    }

    queryStr += ` ORDER BY g.name ASC`;
    const genericsList = db.prepare(queryStr).all(...params) as any[];

    // Fetch linked brands and dosage forms for each generic
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

// ==========================================
// 4. CLINICAL AI CONSULTATION ENGINE
// ==========================================
clinicalRouter.post('/ai-consult', authenticateToken, (req: Request, res: Response) => {
  try {
    const { query, medicineId, customerId } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query prompt is required.' });
    }

    let contextData: any = null;
    let substitutes: any[] = [];
    if (medicineId) {
      contextData = db.prepare(`
        SELECT m.id, m.brand_name, m.strength, m.dosage_form, g.id as generic_id, g.name as generic_name, g.therapeutic_class,
               ci.pregnancy_category, ci.lactation_safety, ci.adult_dosage, ci.pediatric_dosage, ci.food_instructions,
               ci.hepatic_renal_precautions, ci.common_side_effects
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

    // Generate clinical guidance response
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

