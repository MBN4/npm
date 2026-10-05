import type Database from 'better-sqlite3';

// Unverified draft import of the Punjab Drugs Rules 2007 Schedule B / Schedule D poster images
// supplied by the pharmacy owner as reference material. These are NOT a verified or legally
// current drug list - every row is inserted with verification_status = 'DRAFT_UNVERIFIED' and
// must go through the pharmacist classification-review workflow before it can ever gate a POS sale.
//
// Known source gaps (do not silently fill these in):
//  - Schedule D Part 3 was not supplied/available - the Schedule D list below is INCOMPLETE.
//  - Names below are transcribed verbatim from the posters, including apparent spelling/OCR
//    errors; suspected ones are flagged via suspectedError/suspectedErrorNote, never corrected.

const SOURCE_REFERENCE = 'Punjab Drugs Rules 2007 - Schedule B/D poster (unverified transcription supplied by pharmacy owner)';
const SALTS_NOTE = 'Salts, derivatives and preparations apply where specified in the source poster; not independently verified per substance.';

interface RawEntry {
  schedule: 'B' | 'D';
  entryType: 'SUBSTANCE' | 'GROUP';
  name?: string;
  groupDescription?: string;
  restrictionsExemptions?: string;
  suspectedError?: boolean;
  suspectedErrorNote?: string;
}

function substance(schedule: 'B' | 'D', name: string, opts?: { suspectedError?: boolean }): RawEntry {
  return {
    schedule,
    entryType: 'SUBSTANCE',
    name,
    suspectedError: !!opts?.suspectedError,
    suspectedErrorNote: opts?.suspectedError
      ? 'Spelling does not clearly match standard pharmaceutical nomenclature as transcribed from the source poster; verify the exact name/spelling against the official Punjab Drugs Rules 2007 gazette text before relying on this entry.'
      : undefined
  };
}

function group(schedule: 'B' | 'D', groupDescription: string, restrictionsExemptions?: string): RawEntry {
  return { schedule, entryType: 'GROUP', groupDescription, restrictionsExemptions };
}

const SCHEDULE_B_SUBSTANCE_NAMES: Array<[string, boolean?]> = [
  ['Acetorphine'], ['Acetylmethadol'], ['Allyiprodine'], ['Alphacelylemethadol', true], ['Alphamethadol'],
  ['Alphaprodine'], ['Atileridine'], ['Benzethidin'], ['Benzylmorpine'], ['Betacoylethadol', true],
  ['Betaprodine'], ['Betamethadol'], ['Bezitramide'], ['Bezodiazepine', true], ['Buprenorphene'],
  ['Cannabis'], ['Clonitazone'], ['Coca Leaf'], ['Codoxime'], ['Concentrate of poppy straw'],
  ['Desmorphine'], ['Dextromoramide'], ['Diampromid'], ['Diethylthiambutene'], ['Difenoxin'],
  ['Dihydromorphine'], ['Dimenoxadol'], ['Dimepheptenol'], ['Dimethylthiambutene'], ['Dioxaphetyl butyrate'],
  ['Diphenoxylate'], ['Dipipanone'], ['Dextropropxyphene', true], ['Dorotebano', true], ['Ecoonino', true],
  ['Ethylmothylthiambutone', true], ['Etonitazene'], ['Etorphine'], ['Etoxeridne', true], ['Fantayl', true],
  ['Furethidine'], ['Heroin'], ['Hydrocodone'], ['Hydromorphinof', true], ['Hydromorphone'],
  ['Hydroxyperthidine', true], ['Isomethadone'], ['Katobemidone', true], ['Levomethorphen', true], ['Levomeramide', true],
  ['Levophenacylmorphen', true], ['Levorphanol'], ['Methazocine'], ['Methadone'], ['Methadone intermediate'],
  ['Methyldeserphine', true], ['Methyldihydromorphine'], ['Metopen', true], ['Moramide intermediate'], ['Morpheridine'],
  ['Morphine M-oxide'], ['Myrophine'], ['Nicomorphine'], ['Noracynethadol', true], ['Norlevorphanol'],
  ['Normathadone'], ['Normorphine'], ['Norpipnene', true], ['Opium'], ['Oxycodone'],
  ['Oxymorphone'], ['Pethidine'], ['Pethidine intermediate A'], ['Pethidine intermediate B'], ['Pethidine intermediate C'],
  ['Phenadoxone'], ['Phenampromide'], ['Phenazocine'], ['Phenomorphan'], ['Phenoperidine'],
  ['Piminodine'], ['Piritrameide'], ['Propheptazine'], ['Properidine'], ['Pentazocine'],
  ['Recamethorphane', true], ['Recomoramide', true], ['Racemorphan'], ['Surfatnil', true], ['Thebacon'],
  ['Thebaine'], ['Tramadol'], ['Trimeperidine'], ['Acetyl dihydro codein'], ['Ethylmorphine'],
  ['Nicocodiene'], ['Norcodein'], ['Pholcodein'], ['Propyiyam', true]
];

const SCHEDULE_B_PART3_SUBSTANCES: string[] = [
  'DET - N,N-diethyltryptamine', 'DMHP', 'DMT - N,N-dimethyltryptamine', 'Lysergide (LSD, LSD-25)', 'Mescaline',
  'Parahexyl', 'Psilocybine / Psilocine', 'STP / DBM', 'Tetrahydrocannabinols, all isomers', 'Amphetamine',
  'Dexamphetamine', 'Methamphetamine', 'Methylphenidate', 'Phencyclidine', 'Phenmetrazine',
  'Amobarbital', 'Cyclobarbital', 'Glutethimide', 'Pentobarbital', 'Secobarbital',
  'Ampetramone', 'Barbital', 'Ethchlorvynol', 'Ethinamate', 'Meprobamate',
  'Methaqualone', 'Methylphenobarbital', 'Methyprylon', 'Phenobarbital', 'Pipradrol', 'SPA'
];

const SCHEDULE_B_PART3_GROUPS: RawEntry[] = [
  group('B', 'Morphine; Morphine Methorbromide and other pentavalent nitrogen morphine derivatives (including morphine-N-oxide derivatives such as Codeine-N-oxide)'),
  group('B', 'Drugs listed in the Schedule to CNS Act 1997', 'Cross-reference only - the CNS Act 1997 schedule text itself was not supplied, so the actual substances it names are not enumerated here (known gap).'),
  group('B', 'Steroids except topical preparations', 'Except topical preparations')
];

const SCHEDULE_D_PART1_ANTIBIOTICS: string[] = [
  'Bacitracin', 'Carbomycin', 'Chloramphenicol', 'Chlortetracycline', 'Colimycin', 'Dihydrostreptomycin',
  'Erythromycin', 'Framycetin', 'Gramicidin', 'Griseofulvin', 'Kanamycin', 'Neomycin',
  'Novobiocin', 'Nystatin', 'Oleandomycin', 'Oxytetracycline', 'Penicillin', 'Paromomycin',
  'Polymyxin', 'Spiramycin', 'Streptomycin', 'Tetracycline', 'Tyrothricin', 'Vancomycin',
  'Viomycin', 'Cephalosporins'
];

const SCHEDULE_D_PART2_SUBSTANCES: string[] = [
  'Amitriptyline (and salts)', 'Antazoline', 'Bromazine', 'Bucidine', 'Chlorcyclizine', 'Diphenhydramine',
  'Diphenpyraline', 'Meclozine', 'Phenindamine', 'Promethazine', 'Prophenpyridamine', 'Pyrilamine',
  'Thenalidine', 'Azapetine (and salts)', 'Aenactyzine (and salts)', 'Bendrofluazide', 'Pentazocine',
  'Buprenorphines', 'Tramadols'
];

const SCHEDULE_D_PART2_GROUPS: RawEntry[] = [
  group('D', 'ACTH (adrenocorticotrophic hormone)'),
  group('D', 'Androgenic, anabolic, oestrogenic and progestational substances'),
  group('D', 'Benzeestrol and specified oestrogenic derivatives'),
  group('D', 'Antibiotics named in Schedule D, and their salts / derivatives'),
  group('D', 'Benzodiazepines')
];

const SCHEDULE_D_PART4_SUBSTANCES: string[] = [
  'Isoxsuprine', 'Mepromate', 'Methaqualone (and salts)', "Methyphenpynol, its ester and other derivatives", 'Metronidazole',
  'Mialamide (and salts)', 'Oxytocin', 'Para-aminosalicylic acid and specified derivatives / salts', 'Pempidine (and salts)',
  'Pecazine (and salts)', 'Pherelzine (and salts)', 'Phenynamidol (and salts)', 'Pivazide', 'Polythiazide',
  'Promazine (and salts)', 'Pyrvinium (and salts)', 'Sorbide nitrate', 'Spironolactone', 'Thiopropazate (and salts)',
  'Tranyllocypromine (and salts)', 'Trimeprazine (and salts)', 'Vasopressin'
];

const SCHEDULE_D_PART4_GROUPS: RawEntry[] = [
  group('D', 'Phenothiazine derivatives and salts not otherwise specified'),
  group('D', 'Pituitary gland active principles not otherwise specified, and their salts')
];

function buildEntries(): RawEntry[] {
  const entries: RawEntry[] = [];
  for (const [name, suspect] of SCHEDULE_B_SUBSTANCE_NAMES) entries.push(substance('B', name, { suspectedError: suspect }));
  for (const name of SCHEDULE_B_PART3_SUBSTANCES) entries.push(substance('B', name));
  entries.push(...SCHEDULE_B_PART3_GROUPS);
  for (const name of SCHEDULE_D_PART1_ANTIBIOTICS) entries.push(substance('D', name));
  for (const name of SCHEDULE_D_PART2_SUBSTANCES) entries.push(substance('D', name));
  entries.push(...SCHEDULE_D_PART2_GROUPS);
  for (const name of SCHEDULE_D_PART4_SUBSTANCES) entries.push(substance('D', name));
  entries.push(...SCHEDULE_D_PART4_GROUPS);
  return entries;
}

export function seedScheduleBDClassifications(db: Database.Database): void {
  const existing = (db.prepare('SELECT COUNT(*) as count FROM drug_classifications').get() as { count: number }).count;
  if (existing > 0) return;

  const insert = db.prepare(`
    INSERT INTO drug_classifications (
      version, is_current, entry_type, substance_name, group_description, schedule,
      salts_derivatives_note, restrictions_exemptions, jurisdiction, source_reference,
      verification_status, suspected_error_flag, suspected_error_note
    ) VALUES (1, 1, ?, ?, ?, ?, ?, ?, 'Punjab, Pakistan', ?, 'DRAFT_UNVERIFIED', ?, ?)
  `);

  const entries = buildEntries();

  const tx = db.transaction(() => {
    for (const e of entries) {
      insert.run(
        e.entryType,
        e.entryType === 'SUBSTANCE' ? e.name : null,
        e.entryType === 'GROUP' ? e.groupDescription : null,
        e.schedule,
        SALTS_NOTE,
        e.restrictionsExemptions || null,
        SOURCE_REFERENCE,
        e.suspectedError ? 1 : 0,
        e.suspectedErrorNote || null
      );
    }

    db.prepare(`
      INSERT INTO drug_classification_import_log (source_reference, summary, gaps_note, imported_count)
      VALUES (?, ?, ?, ?)
    `).run(
      SOURCE_REFERENCE,
      `Imported Schedule B Parts 1-3 (complete) and Schedule D Parts 1, 2 and 4 as unverified drafts. Schedule D Part 3 was not supplied and is NOT represented - the Schedule D list is known to be incomplete.`,
      `Schedule D Part 3 missing from source material. No duplicated part was detected in the supplied images (the original brief warned Part 2 might be duplicated - re-check if a second copy of any part surfaces). Several substance names are flagged suspected_error_flag=1 for likely spelling/OCR issues and must be verified against the official gazette text, not auto-corrected. "Drugs listed in the Schedule to CNS Act 1997" is a cross-reference only - the CNS Act 1997 text itself was not supplied.`,
      entries.length
    );
  });

  tx();
}
