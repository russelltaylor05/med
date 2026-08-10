# AGENTS.md

## Mission

Help review the user's symptoms, history, and test results to support diagnosis and treatment planning. Organize the evidence, identify plausible explanations, suggest clinician-facing follow-up questions, and outline treatment options to discuss with a licensed medical professional.

This project is for medical reasoning support, not a substitute for emergency care, in-person examination, or clinician diagnosis and treatment.

## Project map

### `patient/`

- `profile.md`: concise patient background.
- `symptoms.md`: patient-noticed symptoms, sensations, limitations, and patterns. These are possibilities, not proof that every item has the same cause.
- `history.md`: remembered diagnoses, medications, exposures, procedures, allergies, and family history.
- `timeline.md`: dated source events and remembered timeline anchors.

### `records/`

Original source files from the user. These are authoritative and must not be edited unless explicitly requested.

- `labs/YYYY/`: original laboratory reports by collection year.
- `imaging/YYYY-MM-DD-study-name/`: one folder per study, including reports, metadata, original archives, DICOMs, and generated renders.
- `clinical-notes/`: original clinician notes and after-visit summaries.

### `analysis/`

- `current-assessment.md`: concise current interpretation, next steps, and safety notes.
- `evidence-summary.md`: detailed reviewed-result summaries and longitudinal reasoning.
- `open-questions.md`: unresolved facts and clinician-facing questions.
- `analysis/theories/`: active hypotheses. Each theory should explain what fits, what does not fit, what would confirm or weaken it, possible treatment paths to discuss, and supporting research.
- `analysis/theories/overview.md`: ranked comparison of active theories.
- `analysis/theories/research/`: source notes, links, and dated research snapshots.

### `generated/`

Ignored and reproducible artifacts: extracted text, the local SQLite database, OCR images, and temporary review files. Original records remain the authority.

### `tooling/`

Local extraction/import scripts and the database schema.

## Workflow

- Start with `README.md` for navigation.
- Check `patient/symptoms.md`, `patient/history.md`, `patient/timeline.md`, and `analysis/current-assessment.md` before interpreting new information.
- Put new patient-noticed symptoms in `patient/symptoms.md`.
- Put concise remembered background in `patient/history.md` and dated events in `patient/timeline.md`.
- Put the current interpretation in `analysis/current-assessment.md`, detailed result review in `analysis/evidence-summary.md`, and unresolved questions in `analysis/open-questions.md`.
- Update `analysis/theories/overview.md` when the relative ranking of hypotheses changes.
- Keep facts separate from interpretation and use absolute dates when known.
- Preserve source files unchanged and keep generated derivatives out of source-record folders except for the clearly labeled imaging `renders/` directory.
- For PDFs, use `npm run extract -- path/to/report.pdf` when text extraction helps.
