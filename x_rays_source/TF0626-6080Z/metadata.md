# X-Ray Metadata: TF0626-6080Z

Generated from DICOM headers on 2026-06-08. This is a metadata inventory, not a radiology interpretation.

## Study Summary

- Accession number: TF0626-6080Z
- Study date: 2026-06-08
- Study time: 10:53:03
- Study description: XR THORACIC SPINE 3 VW
- Requested procedure description: XR THORACIC SPINE 3 VW
- Body part examined: TSPINE
- Modality: DX
- Institution: TAHOE FOREST HOSPITAL DISTRICT
- Manufacturer: Siemens Healthineers
- Manufacturer model: YSIO X.pree
- Presentation intent: FOR PRESENTATION
- Transfer syntax UID: 1.2.840.10008.1.2
- Patient metadata in DICOM: TAYLOR^RUSSELL^M^^, DOB 1987-02-22, sex M
- Clinical note found in DICOM strings: "chronic midline back pain, no recent injury or trauma"

## Rendered PNG Views

| View | PNG | Source DICOM | DICOM Geometry | Acquisition | Exposure Metadata |
| --- | --- | --- | --- | --- | --- |
| Thoracic spine AP | `thoracic-spine-ap.png` | `1.3.12.2.1107.5.11.1.11667.30000026060809022985200000017.dcm` | 1164x2863, 16-bit grayscale source | 2026-06-08 10:53:03.985134 | View position AP; KVP 76.8; exposure 6; exposure time 7; exposure in uAs 5690; image area dose product 1.715. |
| Thoracic spine lateral | `thoracic-spine-lateral.png` | `1.3.12.2.1107.5.11.1.11667.30000026060809022985200000014.dcm` | 1990x2863, 16-bit grayscale source | 2026-06-08 10:54:16.655502 | View position LATERAL; KVP 80.9; exposure 18; exposure time 25; exposure in uAs 17930; image area dose product 8.29. |
| Thoracic spine swimmer's/lateral | `thoracic-spine-swimmers.png` | `1.3.12.2.1107.5.11.1.11667.30000026060809022985200000011.dcm` | 1590x1853, 16-bit grayscale source | 2026-06-08 10:55:15.394539 | View position LATERAL; KVP 76.8; exposure 16; exposure time 21; exposure in uAs 15839; image area dose product 5.059. |

PNG files were rendered with ImageMagick from the DICOM pixel data using grayscale auto-leveling. The generated PNGs are 16-bit grayscale display files.

## Companion DICOM Objects

| File | Type | Notes |
| --- | --- | --- |
| `1.3.12.2.1107.5.11.1.11667.30000026060809022985200000019.dcm` | X-Ray Radiation Dose structured report | Dose/report companion object; does not render as a separate radiographic view. |

## Notes

- The official written radiology interpretation is stored separately at `../../test_results/2026-06-08-tfhd-thoracic-spine-xray-report.txt`.
- The original DICOM files remain the source of truth for imaging metadata and pixel data.
