# NMP Drug AI & Clinical Safety Protocol

## Strict Safety Boundaries
1. **Separation of Verified Data vs. AI Output**:
   - Verified Drug Reference (salt, contraindicated classes, max dosage, verified interactions) is sourced directly from relational tables.
   - AI Assistance recommendations are clearly labeled with prominent badges: `[AI ASSISTANCE - VERIFY CLINICALLY]`.
2. **Never Override Pharmacist**:
   - The AI acts strictly as an informational tool. It never silently modifies prescriptions or blocks cashier checkout without pharmacist intervention.
3. **No Clinical Hallucinations**:
   - If interaction data between two drugs is not established in the clinical database or verified corpus, the assistant explicitly states: "No documented interaction found in verified database. Use clinical judgment."
