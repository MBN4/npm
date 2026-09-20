import { importSyncData } from '../services/dataSyncService.js';

try {
  console.log('🔄 Importing Git sync data into local database...');
  const result = importSyncData();
  console.log('✅ Import successful!');
  console.log(`📁 Source File: ${result.path}`);
  console.log('📊 Imported Summary:');
  console.log(`   - Categories:        ${result.counts.categories}`);
  console.log(`   - Manufacturers:     ${result.counts.manufacturers}`);
  console.log(`   - Generics:          ${result.counts.generics}`);
  console.log(`   - Medicines:         ${result.counts.medicines}`);
  console.log(`   - Clinical Info:     ${result.counts.drug_clinical_info}`);
  console.log(`   - Suppliers:         ${result.counts.suppliers}`);
  console.log(`   - Batches/Stock:     ${result.counts.batches}`);
  console.log('\n🎉 Your database is now up-to-date with your latest Git data!');
} catch (err: any) {
  console.error('❌ Data Import Failed:', err.message || err);
  process.exit(1);
}
