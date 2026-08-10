# Source Records

Original reports and medical data live here and are the authority over generated text or summaries.

## Layout

- `labs/YYYY/`: original laboratory PDFs, organized by collection year.
- `imaging/YYYY-MM-DD-study-name/`: one folder per imaging study.
- `clinical-notes/`: clinician visit notes and after-visit summaries when available.

Each imaging folder may contain:

- `report.txt` or `report.pdf`: official radiology interpretation.
- `metadata.md`: a generated inventory of DICOM metadata; not an interpretation.
- `original/`: the delivered archive, preserved unchanged.
- `dicom/`: extracted source DICOM objects.
- `renders/`: generated viewable images, ignored by Git.

Use a human-readable date and study name for the folder. Preserve accession numbers inside metadata rather than using them as the primary navigation label.
