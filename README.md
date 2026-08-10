# Medical Review Workspace

This private workspace organizes patient-reported history, original medical records, generated search aids, and working clinical reasoning. It supports discussion with licensed clinicians and is not a substitute for diagnosis, emergency care, or an in-person examination.

## Start here

- [Current assessment](./analysis/current-assessment.md): concise working interpretation, next actions, and safety notes.
- [Symptoms](./patient/symptoms.md): patient-noticed symptoms and patterns.
- [Timeline](./patient/timeline.md): dated records and remembered events.
- [Open questions](./analysis/open-questions.md): missing facts and clinician-facing follow-up.
- [Theories overview](./analysis/theories/overview.md): ranked differential and discriminating evidence.

## Main folders

| Folder | Purpose |
| --- | --- |
| [`patient/`](./patient/) | Profile, remembered medical history, symptoms, and timeline. |
| [`records/`](./records/) | Original labs, imaging studies, reports, and clinician notes. Source records are authoritative and should not be edited. |
| [`analysis/`](./analysis/) | Current assessment, evidence summaries, open questions, theories, and research. |
| `generated/` | Ignored, reproducible text extraction, OCR, database, and temporary artifacts. |
| [`tooling/`](./tooling/) | Extraction/import scripts and the database schema. |

## Filing rules

1. Use ISO dates (`YYYY-MM-DD`) at the start of record and study names.
2. Put patient-reported facts in `patient/`; put interpretation in `analysis/`.
3. Never edit an original record. Corrections or interpretation belong in analysis notes.
4. Keep every imaging study in one human-readable folder containing its metadata, report, original archive, DICOM files, and generated renders.
5. Treat everything in `generated/` and every imaging `renders/` folder as reproducible and disposable.
6. Put superseded material in an explicitly labeled archive rather than mixing it with current records.

## Useful commands

```sh
npm run extract -- records/labs/2026/example.pdf
npm run extract:all
npm run db:rebuild
sqlite3 generated/database/medical.sqlite
```

This repository contains sensitive medical information, including patient metadata embedded in DICOM files. Keep it private and avoid publishing records or generated outputs.
