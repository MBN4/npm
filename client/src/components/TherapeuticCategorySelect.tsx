import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, ChevronRight, Check, Folder, FolderOpen, Tag } from 'lucide-react';

export interface SubCategoryGroup {
  id: number;
  name: string;
  subcategories: string[];
}

export const MASTER_THERAPEUTIC_CATEGORIES: SubCategoryGroup[] = [
  {
    id: 1,
    name: "1. Anti-Infectives",
    subcategories: [
      "Antibacterials / Antibiotics",
      "Penicillins",
      "Penicillin + β-lactamase inhibitor combinations",
      "Cephalosporins",
      "Carbapenems",
      "Monobactams",
      "Macrolides",
      "Ketolides",
      "Fluoroquinolones",
      "Tetracyclines",
      "Glycylcyclines",
      "Aminoglycosides",
      "Sulfonamides",
      "Trimethoprim combinations",
      "Lincosamides",
      "Glycopeptides",
      "Oxazolidinones",
      "Nitroimidazoles",
      "Nitrofurans",
      "Polymyxins",
      "Fosfomycin",
      "Chloramphenicol",
      "Other antibacterials",
      "Antituberculars",
      "Antileprosy drugs",
      "Antifungals",
      "Azole antifungals",
      "Polyenes",
      "Echinocandins",
      "Allylamines",
      "Antivirals",
      "Anti-herpes drugs",
      "Anti-influenza drugs",
      "Hepatitis antivirals",
      "Antiretrovirals",
      "Antimalarials",
      "Antiprotozoals",
      "Antiamoebics",
      "Antigiardial drugs",
      "Anthelmintics",
      "Antiseptics",
      "Disinfectants"
    ]
  },
  {
    id: 2,
    name: "2. Pain, Fever & Inflammation",
    subcategories: [
      "Analgesics",
      "Antipyretics",
      "NSAIDs",
      "COX-2 inhibitors",
      "Opioid analgesics",
      "Non-opioid analgesics",
      "Combination analgesics",
      "Neuropathic-pain medicines",
      "Topical analgesics",
      "Muscle relaxants",
      "Antispasmodics",
      "Anti-gout medicines",
      "DMARDs",
      "Osteoarthritis medicines"
    ]
  },
  {
    id: 3,
    name: "3. Cardiovascular",
    subcategories: [
      "Antihypertensives",
      "ACE inhibitors",
      "ARBs",
      "ARNI",
      "Beta blockers",
      "Calcium-channel blockers",
      "Alpha blockers",
      "Central antihypertensives",
      "Direct renin inhibitors",
      "Vasodilators",
      "Diuretics",
      "Thiazide diuretics",
      "Loop diuretics",
      "Potassium-sparing diuretics",
      "Aldosterone antagonists",
      "Antianginals",
      "Nitrates",
      "Antiarrhythmics",
      "Heart-failure medicines",
      "Cardiac glycosides",
      "Inotropes",
      "Pulmonary-hypertension medicines"
    ]
  },
  {
    id: 4,
    name: "4. Antiplatelet / Anticoagulation & Coagulation",
    subcategories: [
      "Antiplatelets",
      "Aspirin-type antiplatelets",
      "P2Y12 inhibitors",
      "GP IIb/IIIa inhibitors",
      "Anticoagulants",
      "Heparins",
      "LMWH",
      "Vitamin-K antagonists",
      "Direct oral anticoagulants",
      "Direct thrombin inhibitors",
      "Factor-Xa inhibitors",
      "Thrombolytics / Fibrinolytics",
      "Antifibrinolytics",
      "Hemostatics",
      "Coagulation factors"
    ]
  },
  {
    id: 5,
    name: "5. Lipid Management",
    subcategories: [
      "Statins",
      "Fibrates",
      "Cholesterol-absorption inhibitors",
      "PCSK9 inhibitors",
      "Bile-acid sequestrants",
      "Omega-3 preparations",
      "Other lipid-lowering agents"
    ]
  },
  {
    id: 6,
    name: "6. Gastrointestinal",
    subcategories: [
      "Antacids",
      "Proton-pump inhibitors",
      "H2-receptor antagonists",
      "Antiulcer medicines",
      "Mucosal protectants",
      "H. pylori eradication therapy",
      "Antiemetics",
      "5-HT3 antagonists",
      "Dopamine-antagonist antiemetics",
      "Prokinetics",
      "Antispasmodics",
      "Anticholinergic GI medicines",
      "Laxatives",
      "Bulk-forming laxatives",
      "Osmotic laxatives",
      "Stimulant laxatives",
      "Stool softeners",
      "Antidiarrheals",
      "ORS",
      "Digestive enzymes",
      "Pancreatic enzymes",
      "Bile-acid medicines",
      "IBD medicines",
      "Ulcerative-colitis medicines",
      "Crohn’s-disease medicines",
      "IBS medicines",
      "Hemorrhoid preparations",
      "Antiflatulents"
    ]
  },
  {
    id: 7,
    name: "7. Respiratory",
    subcategories: [
      "Bronchodilators",
      "Short-acting beta-2 agonists",
      "Long-acting beta-2 agonists",
      "Anticholinergic bronchodilators",
      "Inhaled corticosteroids",
      "Systemic respiratory corticosteroids",
      "Leukotriene modifiers",
      "Mast-cell stabilizers",
      "Methylxanthines",
      "Asthma medicines",
      "COPD medicines",
      "Antitussives",
      "Expectorants",
      "Mucolytics",
      "Respiratory combination products"
    ]
  },
  {
    id: 8,
    name: "8. Allergy, Cold & Sinus",
    subcategories: [
      "Antihistamines",
      "First-generation antihistamines",
      "Second-generation antihistamines",
      "Antiallergics",
      "Decongestants",
      "Nasal corticosteroids",
      "Nasal antihistamines",
      "Cold/flu combinations"
    ]
  },
  {
    id: 9,
    name: "9. Diabetes",
    subcategories: [
      "Insulins",
      "Rapid-acting insulin",
      "Short-acting insulin",
      "Intermediate-acting insulin",
      "Long-acting insulin",
      "Premixed insulin",
      "Biguanides",
      "Sulfonylureas",
      "Meglitinides",
      "DPP-4 inhibitors",
      "SGLT2 inhibitors",
      "GLP-1 receptor agonists",
      "Dual GIP/GLP-1 medicines",
      "Thiazolidinediones",
      "Alpha-glucosidase inhibitors",
      "Other antidiabetics",
      "Hypoglycemia treatments"
    ]
  },
  {
    id: 10,
    name: "10. Endocrine & Hormonal",
    subcategories: [
      "Thyroid hormones",
      "Antithyroid medicines",
      "Corticosteroids",
      "Mineralocorticoids",
      "Pituitary hormones",
      "Growth hormones",
      "Somatostatin analogues",
      "Adrenal medicines",
      "Estrogens",
      "Progestogens",
      "Androgens",
      "Antiandrogens",
      "Gonadotropins",
      "Hormone antagonists"
    ]
  },
  {
    id: 11,
    name: "11. CNS / Neurology",
    subcategories: [
      "Antiepileptics / Anticonvulsants",
      "Antimigraine medicines",
      "Triptans",
      "Migraine-prevention medicines",
      "Anti-Parkinson medicines",
      "Dopaminergic medicines",
      "Dementia medicines",
      "Cholinesterase inhibitors",
      "NMDA antagonists",
      "Neuropathic-pain medicines",
      "CNS stimulants",
      "ADHD medicines",
      "Multiple-sclerosis medicines",
      "Motor-neuron-disease medicines"
    ]
  },
  {
    id: 12,
    name: "12. Psychiatry",
    subcategories: [
      "Antidepressants",
      "SSRIs",
      "SNRIs",
      "TCAs",
      "MAO inhibitors",
      "Atypical antidepressants",
      "Antipsychotics",
      "Typical antipsychotics",
      "Atypical antipsychotics",
      "Anxiolytics",
      "Benzodiazepines",
      "Non-benzodiazepine anxiolytics",
      "Sedatives",
      "Hypnotics",
      "Z-drugs",
      "Mood stabilizers"
    ]
  },
  {
    id: 13,
    name: "13. Dermatology",
    subcategories: [
      "Topical corticosteroids",
      "Topical antibacterials",
      "Topical antifungals",
      "Topical antivirals",
      "Anti-acne medicines",
      "Retinoids",
      "Antipruritics",
      "Emollients",
      "Moisturizers",
      "Barrier preparations",
      "Keratolytics",
      "Psoriasis medicines",
      "Eczema/dermatitis medicines",
      "Scabicides",
      "Pediculicides",
      "Depigmenting agents",
      "Wound-care preparations",
      "Burn preparations",
      "Sunscreens"
    ]
  },
  {
    id: 14,
    name: "14. Ophthalmology",
    subcategories: [
      "Ophthalmic antibiotics",
      "Ophthalmic antivirals",
      "Ophthalmic antifungals",
      "Ophthalmic corticosteroids",
      "Ophthalmic NSAIDs",
      "Antiallergic eye drops",
      "Ocular lubricants/artificial tears",
      "Antiglaucoma medicines",
      "Beta-blocker eye drops",
      "Prostaglandin analogues",
      "Carbonic-anhydrase inhibitors",
      "Alpha agonists",
      "Miotics",
      "Mydriatics",
      "Cycloplegics"
    ]
  },
  {
    id: 15,
    name: "15. ENT",
    subcategories: [
      "Otic antibiotics",
      "Otic antifungals",
      "Ear-wax preparations",
      "Nasal decongestants",
      "Nasal steroids",
      "Nasal antihistamines",
      "Saline preparations",
      "Throat preparations"
    ]
  },
  {
    id: 16,
    name: "16. Genitourinary",
    subcategories: [
      "BPH medicines",
      "Alpha-1 blockers",
      "5-alpha-reductase inhibitors",
      "Overactive-bladder medicines",
      "Urinary antispasmodics",
      "Urinary alkalinizers",
      "Urinary analgesics",
      "Erectile-dysfunction medicines",
      "PDE-5 inhibitors",
      "Urinary anti-infectives"
    ]
  },
  {
    id: 17,
    name: "17. Gynecology & Reproductive Health",
    subcategories: [
      "Combined contraceptives",
      "Progestin-only contraceptives",
      "Emergency contraception",
      "Fertility medicines",
      "Ovulation-induction medicines",
      "HRT",
      "Uterotonics",
      "Tocolytics",
      "Vaginal antifungals",
      "Vaginal antibacterials",
      "Vaginal hormones"
    ]
  },
  {
    id: 18,
    name: "18. Hematology",
    subcategories: [
      "Hematinics",
      "Iron preparations",
      "Oral iron",
      "Parenteral iron",
      "Folic acid",
      "Vitamin B12",
      "Erythropoiesis-stimulating agents",
      "Colony-stimulating factors"
    ]
  },
  {
    id: 19,
    name: "19. Vitamins & Minerals",
    subcategories: [
      "Multivitamins",
      "Vitamin A",
      "Vitamin B complex",
      "Vitamin C",
      "Vitamin D",
      "Vitamin E",
      "Vitamin K",
      "Calcium",
      "Magnesium",
      "Zinc",
      "Potassium",
      "Iron",
      "Trace elements",
      "Prenatal vitamins"
    ]
  },
  {
    id: 20,
    name: "20. Nutrition & Electrolytes",
    subcategories: [
      "ORS",
      "Electrolyte preparations",
      "Enteral nutrition",
      "Parenteral nutrition",
      "Protein supplements",
      "Caloric supplements",
      "Pediatric nutrition"
    ]
  },
  {
    id: 21,
    name: "21. Bone & Mineral Metabolism",
    subcategories: [
      "Calcium preparations",
      "Vitamin-D analogues",
      "Bisphosphonates",
      "SERMs",
      "Calcitonin",
      "Parathyroid-hormone analogues",
      "RANKL inhibitors",
      "Osteoporosis medicines"
    ]
  },
  {
    id: 22,
    name: "22. Rheumatology & Autoimmune",
    subcategories: [
      "NSAIDs",
      "Conventional DMARDs",
      "Biological DMARDs",
      "JAK inhibitors",
      "Immunosuppressants",
      "Anti-gout medicines"
    ]
  },
  {
    id: 23,
    name: "23. Immunology",
    subcategories: [
      "Immunosuppressants",
      "Immunomodulators",
      "Immunostimulants",
      "Monoclonal antibodies",
      "Biological medicines",
      "Immunoglobulins"
    ]
  },
  {
    id: 24,
    name: "24. Vaccines",
    subcategories: [
      "Bacterial vaccines",
      "Viral vaccines",
      "Combination vaccines",
      "Toxoids",
      "Other immunization products"
    ]
  },
  {
    id: 25,
    name: "25. Oncology",
    subcategories: [
      "Cytotoxic chemotherapy",
      "Alkylating agents",
      "Antimetabolites",
      "Antitumor antibiotics",
      "Topoisomerase inhibitors",
      "Mitotic inhibitors",
      "Platinum compounds",
      "Targeted anticancer therapy",
      "Tyrosine-kinase inhibitors",
      "Monoclonal antibodies",
      "Cancer immunotherapy",
      "Hormonal anticancer therapy",
      "Supportive oncology medicines"
    ]
  },
  {
    id: 26,
    name: "26. Renal",
    subcategories: [
      "CKD medicines",
      "Phosphate binders",
      "Potassium binders",
      "Erythropoiesis medicines",
      "Dialysis-related medicines",
      "Renal electrolyte medicines"
    ]
  },
  {
    id: 27,
    name: "27. Anesthesia",
    subcategories: [
      "General anesthetics",
      "Local anesthetics",
      "Neuromuscular blockers",
      "Reversal agents",
      "Pre-anesthetic medicines"
    ]
  },
  {
    id: 28,
    name: "28. Emergency & Critical Care",
    subcategories: [
      "Resuscitation medicines",
      "Vasopressors",
      "Inotropes",
      "Emergency antiarrhythmics",
      "Emergency antihypertensives",
      "Antidotes",
      "Poisoning treatments"
    ]
  },
  {
    id: 29,
    name: "29. IV Fluids & Blood Products",
    subcategories: [
      "Normal saline",
      "Dextrose solutions",
      "Ringer’s/Lactated Ringer’s",
      "Balanced crystalloids",
      "Colloids",
      "Plasma-volume expanders",
      "Electrolyte infusions",
      "Blood products",
      "Plasma products"
    ]
  },
  {
    id: 30,
    name: "30. Transplant Medicines",
    subcategories: [
      "Calcineurin inhibitors",
      "Antiproliferative agents",
      "mTOR inhibitors",
      "Transplant immunosuppressants"
    ]
  },
  {
    id: 31,
    name: "31. Oral & Dental",
    subcategories: [
      "Oral antiseptics",
      "Mouthwashes",
      "Dental analgesics",
      "Oral antifungals",
      "Oral ulcer preparations",
      "Fluoride preparations",
      "Local oral anesthetics"
    ]
  },
  {
    id: 32,
    name: "32. Smoking Cessation",
    subcategories: [
      "Nicotine-replacement medicines",
      "Non-nicotine smoking-cessation medicines"
    ]
  },
  {
    id: 33,
    name: "33. Vertigo & Motion Sickness",
    subcategories: [
      "Antivertigo medicines",
      "Vestibular suppressants",
      "Motion-sickness medicines"
    ]
  },
  {
    id: 34,
    name: "34. Obesity & Weight Management",
    subcategories: [
      "Anti-obesity medicines",
      "Lipase inhibitors",
      "Incretin-based weight-management medicines",
      "Other weight-management medicines"
    ]
  },
  {
    id: 35,
    name: "35. Diagnostic Agents",
    subcategories: [
      "Diagnostic preparations",
      "Radiopharmaceuticals",
      "Diagnostic dyes",
      "Testing agents"
    ]
  },
  {
    id: 36,
    name: "36. Contrast Media",
    subcategories: [
      "Iodinated contrast",
      "Gadolinium contrast",
      "Other contrast agents"
    ]
  },
  {
    id: 37,
    name: "37. Enzymes",
    subcategories: [
      "Digestive enzymes",
      "Pancreatic enzymes",
      "Replacement enzymes",
      "Therapeutic enzymes"
    ]
  },
  {
    id: 38,
    name: "38. Biologics",
    subcategories: [
      "Monoclonal antibodies",
      "Recombinant proteins",
      "Cytokines",
      "Growth factors",
      "Other biological therapies"
    ]
  },
  {
    id: 39,
    name: "39. Medical Gases",
    subcategories: [
      "Medical oxygen",
      "Nitrous oxide",
      "Other therapeutic gases"
    ]
  },
  {
    id: 40,
    name: "40. Miscellaneous / Unclassified",
    subcategories: []
  }
];

interface TherapeuticCategorySelectProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export const TherapeuticCategorySelect: React.FC<TherapeuticCategorySelectProps> = ({
  value,
  onChange,
  placeholder = "Select or search category..."
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => setTriggerRect(dropdownRef.current?.getBoundingClientRect() || null);
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        dropdownRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const toggleGroup = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelect = (selectedVal: string) => {
    onChange(selectedVal);
    setIsOpen(false);
    setSearchQuery('');
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // Filter category groups & subcategories
  const filteredGroups = MASTER_THERAPEUTIC_CATEGORIES.map(group => {
    const groupNameMatches = group.name.toLowerCase().includes(trimmedQuery);
    const matchingSubs = group.subcategories.filter(sub => 
      sub.toLowerCase().includes(trimmedQuery)
    );
    return {
      ...group,
      groupNameMatches,
      matchingSubs,
      hasMatch: groupNameMatches || matchingSubs.length > 0
    };
  }).filter(group => !isSearching || group.hasMatch);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Button */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen && dropdownRef.current && window.innerHeight - dropdownRef.current.getBoundingClientRect().bottom < 160) {
            dropdownRef.current.scrollIntoView({ block: 'start' });
          }
          setTriggerRect(dropdownRef.current?.getBoundingClientRect() || null);
          setIsOpen(!isOpen);
        }}
        className="input"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--bg-card)',
          border: isOpen ? '1px solid var(--primary)' : '1px solid var(--border)',
          boxShadow: isOpen ? '0 0 0 2px rgba(2, 132, 199, 0.2)' : 'none',
          padding: '0.45rem 0.75rem',
          minHeight: '38px',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
          <Tag size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span style={{
            fontSize: '0.82rem',
            fontWeight: value ? 600 : 400,
            color: value ? 'var(--text-main)' : 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {value || placeholder}
          </span>
        </div>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && triggerRect && createPortal(
        <div ref={panelRef} style={{
          position: 'fixed',
          top: triggerRect.bottom + 4,
          left: triggerRect.left,
          width: triggerRect.width,
          zIndex: 10000,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5), 0 8px 12px -6px rgba(0,0,0,0.3)',
          maxHeight: Math.max(100, Math.min(380, window.innerHeight - triggerRect.bottom - 12)),
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Search Bar Header */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', color: 'var(--text-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                className="input"
                placeholder="Search 40 parent categories & subcategories..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '2.1rem',
                  fontSize: '0.78rem',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)'
                }}
              />
            </div>
          </div>

          {/* Categories Accordion List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
            {filteredGroups.map(group => {
              const isExpanded = isSearching || !!expandedGroups[group.id];
              const isMainSelected = value === group.name;

              return (
                <div key={group.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  {/* Main Category Header Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.75rem',
                      cursor: 'pointer',
                      backgroundColor: isMainSelected ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = isMainSelected ? 'rgba(2, 132, 199, 0.18)' : 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = isMainSelected ? 'rgba(2, 132, 199, 0.15)' : 'transparent'}
                  >
                    {/* Category Title */}
                    <div
                      onClick={() => handleSelect(group.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, overflow: 'hidden' }}
                    >
                      {isExpanded ? (
                        <FolderOpen size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      ) : (
                        <Folder size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: '0.78rem', fontWeight: isMainSelected ? 800 : 700, color: isMainSelected ? 'var(--primary)' : 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {group.name}
                      </span>
                      {isMainSelected && <Check size={13} style={{ color: 'var(--primary)', marginLeft: '0.2rem' }} />}
                    </div>

                    {/* Subcategories Counter Badge & Expand Toggle */}
                    {group.subcategories.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          backgroundColor: 'rgba(2, 132, 199, 0.1)',
                          color: 'var(--primary)',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '10px'
                        }}>
                          {group.subcategories.length} subs
                        </span>
                        <div
                          onClick={(e) => toggleGroup(group.id, e)}
                          style={{
                            padding: '0.15rem',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <ChevronRight
                            size={14}
                            style={{
                              color: 'var(--text-muted)',
                              transform: isExpanded ? 'rotate(90deg)' : 'none',
                              transition: 'transform 0.2s'
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Subcategories List */}
                  {isExpanded && group.subcategories.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.15)', paddingLeft: '1.75rem', paddingRight: '0.5rem', paddingTop: '0.15rem', paddingBottom: '0.25rem' }}>
                      {(isSearching ? group.matchingSubs : group.subcategories).map((sub, sIdx) => {
                        const subFullVal = `${group.name.replace(/^\d+\.\s*/, '')} > ${sub}`;
                        const isSubSelected = value === sub || value === subFullVal;

                        return (
                          <div
                            key={sIdx}
                            onClick={() => handleSelect(subFullVal)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.35rem 0.5rem',
                              fontSize: '0.74rem',
                              cursor: 'pointer',
                              borderRadius: 'var(--radius-sm)',
                              color: isSubSelected ? 'var(--primary)' : 'var(--text-secondary)',
                              fontWeight: isSubSelected ? 700 : 400,
                              backgroundColor: isSubSelected ? 'rgba(2, 132, 199, 0.12)' : 'transparent',
                              marginBottom: '0.1rem'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = isSubSelected ? 'rgba(2, 132, 199, 0.15)' : 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = isSubSelected ? 'rgba(2, 132, 199, 0.12)' : 'transparent'}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>•</span>
                              <span>{sub}</span>
                            </span>
                            {isSubSelected && <Check size={12} style={{ color: 'var(--primary)' }} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredGroups.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  No categories found matching "{searchQuery}"
                </p>
                <button
                  type="button"
                  onClick={() => handleSelect(searchQuery)}
                  style={{
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer'
                  }}
                >
                  Use custom: "{searchQuery}"
                </button>
              </div>
            )}
          </div>
        </div>, document.body
      )}
    </div>
  );
};
