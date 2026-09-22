# NMP Known Issues & Limitations

## Current limitations — 2026-09-22

- **GitHub delivery:** The local `main` branch contains recent changes, but `git push origin main` fails with `could not read Username for 'https://github.com'`. Other devices cannot receive these commits through Git until GitHub authentication is configured and push/pull succeeds.
- **Local data:** SQLite files are local and ignored by Git. A code pull does not move patient, stock, or sales records created on another device. Use one shared server or the documented export/import flow where appropriate.
- **Hardware print verification:** MedPrac and POS share the Windows Speed-X raw printer path; the Linux development machine has no configured printer. The browser thermal print dialog remains available.
- **Test fixtures:** Focused tests for recent changes pass. Some older whole-suite tests assume the previous seeded medicine catalog and need fixture updates before the full suite can be reported as passing.
