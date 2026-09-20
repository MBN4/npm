import { exportSyncData } from '../services/dataSyncService.js';

try {
  console.log('🔄 Exporting database catalog and medicine data for Git Sync...');
  const result = exportSyncData();
  console.log('✅ Export successful!');
  console.log(`📁 File written to: ${result.path}`);
  console.log('📊 Exported Summary:');
  console.log(`   - Categories:        ${result.counts.categories}`);
  console.log(`   - Manufacturers:     ${result.counts.manufacturers}`);
  console.log(`   - Generics:          ${result.counts.generics}`);
  console.log(`   - Medicines:         ${result.counts.medicines}`);
  console.log(`   - Clinical Info:     ${result.counts.drug_clinical_info}`);
  console.log(`   - Suppliers:         ${result.counts.suppliers}`);
  console.log(`   - Batches/Stock:     ${result.counts.batches}`);
  console.log('\n🚀 Next Steps to Sync to PC:');
  console.log('   1. Run: git add .');
  console.log('   2. Run: git commit -m "Update medicine sync data"');
  console.log('   3. Run: git push');
  console.log('   4. On PC: run git pull && npm run db:import');
} catch (err: any) {
  console.error('❌ Data Export Failed:', err.message || err);
  process.exit(1);
}
