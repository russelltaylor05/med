# AGENTS.md

## Mission

Help review the user's symptoms, history, and test results to support diagnosis and treatment planning. Organize the evidence, identify plausible explanations, suggest clinician-facing follow-up questions, and outline treatment options to discuss with a licensed medical professional.

This project is for medical reasoning support, not a substitute for emergency care, in-person examination, or clinician diagnosis and treatment.

## Files

### `SYMPTOMS.md`

Symptoms, sensations, limitations, and observations the user thinks might be related. These are user-noticed possibilities, not proof that each item has the same cause.

### `HISTORY.md`

Short, sweet medical history the user remembers: past diagnoses, medications, allergies, procedures, family history, exposures, and major timeline anchors.

### `MEMORY.md`

Working memory for the investigation: reviewed files, lab summaries, current interpretation, open questions, possible diagnoses, treatment options to discuss, and useful sources.

### `theories/`

Folder for possible conditions and working hypotheses.

- Each theory should explain what fits, what does not fit, what would confirm or weaken it, possible treatment paths to discuss, and supporting research.
- `overview.md` compares the active theories and summarizes what matches or does not match.
- `research/` stores source notes, links, and research snapshots used by the theory files.

### `test_results/`

Original source files from the user, such as lab reports, imaging reports, and other medical documents. Do not edit these files unless explicitly asked.

### `extracted_text/`

Generated text extracted from source files. Helpful for searching and review, but the original report remains the authority.

## Workflow

- Check `SYMPTOMS.md`, `HISTORY.md`, and `MEMORY.md` before interpreting new information.
- Put new user-noticed symptoms in `SYMPTOMS.md`.
- Put concise remembered background in `HISTORY.md`.
- Put reasoning, summaries, questions, and next-step options in `MEMORY.md`.
- Keep facts separate from interpretation.
- Use absolute dates when known.
- For PDFs, use `npm run extract -- path/to/report.pdf` when text extraction helps.
