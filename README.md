# NutriScan

**AI-Powered Food Label Intelligence & Personalized Dietary Risk Analysis**

NutriScan is a barcode-free food-label analysis prototype. Users upload an ingredient label or capture one with a desktop webcam. The application decodes the image in memory, preprocesses it with OpenCV, extracts text with EasyOCR, recognizes valid INS/E-codes, maps known additives through SQLite, and sends the resulting label evidence to Gemini for personalized dietary analysis.

The system returns structured JSON containing the OCR result, detected additives, Gemini risk assessment, evidence, explanation, recommendation, and confidence. Scan summaries are stored in local SQLite history; uploaded images are not persisted.

## Problem

Ingredient panels contain dense text, OCR-sensitive layouts, and additive identifiers that are difficult to interpret consistently. Barcode-based workflows also depend on product coverage and do not necessarily reflect the exact label being inspected. NutriScan focuses on the label image itself and preserves the extracted evidence used for analysis.

## Solution

```text
Image / Webcam
      |
      v
React UI
      |
      v
FastAPI /scan
      |
      v
OpenCV + EasyOCR
      |
      v
Raw OCR text
      |
      v
INS/E-code extraction and normalization
      |
      v
SQLite additive mapping
      |
      v
Gemini analysis
      |
      v
Validated structured JSON
      |
      v
React result and SQLite history
```

## Key Features

- Desktop webcam capture and image upload
- OpenCV preprocessing and EasyOCR label extraction
- Strict INS/E-code recognition with normalization such as `INS 322` -> `E322`
- SQLite additive knowledge base with code, name, condition, hazard, and note metadata
- User-selected dietary profile context
- Gemini analysis of supplied OCR text and additive evidence
- Structured JSON result validation
- Evidence, reasoning, recommendation, and confidence fields
- Scan history without storing uploaded images
- Graceful handling of unavailable Gemini analysis and unmapped codes

## System Architecture

The main application is split into a React/Vite frontend and a Python/FastAPI backend:

```text
User
 |
 v
frontend/src/App.jsx
 |
 | multipart image + JSON dietary profile
 v
api.py: POST /scan
 |
 +--> cv2.imdecode (in-memory image)
 |
 +--> vision_engine.py
 |      +--> OpenCV preprocessing
 |      `--> EasyOCR reader reuse
 |
 +--> db_builder.py
 |      +--> strict E/INS extraction
 |      +--> additive name matching
 |      `--> SQLite metadata lookup
 |
 `--> llm_engine.py
        +--> Gemini evidence prompt
        `--> JSON validation / unavailable response
 |
 v
Structured response -> React result
 |
 v
SQLite scan_history
```

## Processing Pipeline

1. **Capture:** React accepts an image file, drag-and-drop file, or webcam frame through `react-webcam`.
2. **Decode:** FastAPI reads the multipart bytes and decodes them with `cv2.imdecode`; no image file is required for processing.
3. **Preprocess and OCR:** OpenCV creates an enhanced candidate and EasyOCR reads both the original and enhanced image, reusing a module-level reader.
4. **Extract codes:** Valid `E` plus three digits and `INS` plus three digits are recognized case-insensitively. `INS 322` and `INS322` normalize to `E322`.
5. **Map additives:** Recognized codes and whole-name matches are looked up in the `additives` SQLite table. Valid codes absent from the table are returned as `unmapped_additives`.
6. **Prepare context:** Gemini receives selected conditions, raw OCR text, normalized ingredient text, and detected additive metadata.
7. **Analyze:** Gemini evaluates sugar, glucose, dextrose, salt/sodium, allergens, and supplied additive evidence when present.
8. **Validate JSON:** The backend accepts only the expected risk-analysis schema and restricts returned additive codes to codes detected by the backend.
9. **Present result:** React renders the risk level when valid, or an unavailable state while retaining OCR and additive information.
10. **Persist history:** A scan summary is stored in SQLite through the history layer; the uploaded image is not stored.

## INS/E-Code Processing

`db_builder.py` contains the deterministic extraction and mapping helpers:

- `extract_additive_codes()` accepts only strict three-digit `E` or `INS` forms with token boundaries.
- `INS` prefixes normalize to the equivalent `E` code, for example `INS 322` -> `E322`.
- OCR text such as `HYDROGENATED 949` is not treated as an additive code.
- `find_known_additives()` maps valid codes and whole ingredient names to SQLite metadata.
- `find_unmapped_additives()` reports valid detected codes that are not present in SQLite without inventing a name.

The existing `additives` table contains `code`, `name`, `functional_class`, `affected_conditions`, `base_hazard`, and `clinical_note`. SQLite supplies additive context to Gemini; it is not presented as a clinical validation system.

## AI Analysis

`llm_engine.py` sends Gemini:

- selected dietary conditions
- complete raw OCR text
- normalized ingredient text
- valid detected INS/E codes
- SQLite metadata for detected additives

The expected Gemini JSON contains:

```json
{
  "risk_level": "LOW | MODERATE | HIGH | UNKNOWN",
  "summary": "...",
  "flagged_ingredients": [],
  "detected_additives": [],
  "condition_assessment": [],
  "evidence": [],
  "reasoning": "...",
  "recommendation": "...",
  "confidence": 0.0
}
```

The configured model is read from `GEMINI_MODEL`; the repository example uses `gemini-3.5-flash-lite`. Malformed responses, quota failures, unavailable models, and missing credentials produce an explicit `UNKNOWN`/unavailable analysis rather than a fabricated result. This is a dietary decision-support prototype, not a medically validated diagnostic system.

## Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | React, Vite, Tailwind CSS, `react-webcam`, `lucide-react` |
| Backend | Python, FastAPI, Uvicorn |
| Vision/OCR | OpenCV, NumPy, EasyOCR |
| Data | SQLite, CSV, `pdfplumber` for the full database builder |
| AI | Google Gemini API via `google-generativeai` |
| Configuration | `python-dotenv` |

## Project Structure

```text
.
|-- api.py                         # FastAPI endpoints and HTTP concerns
|-- backend/
|   |-- __init__.py
|   `-- scan_pipeline.py           # Image-to-response scan orchestration
|-- vision_engine.py               # OpenCV preprocessing and EasyOCR
|-- db_builder.py                  # SQLite setup, extraction, mapping, history
|-- llm_engine.py                  # Gemini prompt and JSON validation
|-- additives.csv                  # Additive metadata source
|-- CXG_036e_2015.pdf              # Source PDF for full database generation
|-- build_full_db.py               # Rebuilds the full additive database
|-- requirements.txt
|-- .env.example
|-- scripts/test_scan.py           # Real-image smoke test
|-- tests/assets/test_label.jpg    # Demo label asset
|-- legacy/streamlit_app.py        # Archived alternative UI
|-- frontend/
|   |-- src/App.jsx
|   |-- package.json
|   |-- package-lock.json
|   `-- vite.config.js
`-- README.md
```

Generated and private files such as `.env`, `nutriscan.db`, `.venv`, `node_modules`, `dist`, caches, logs, and temporary images are excluded from publication by `.gitignore`.

## Setup

### Backend

From the repository root on Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set your own `GEMINI_API_KEY` in `.env`. `GEMINI_MODEL` selects the model used for analysis.

The API initializes the SQLite schema and loads the CSV at startup. To build the larger additive database from the CSV and Codex PDF, run:

```powershell
python build_full_db.py
```

Start the backend:

```powershell
python api.py
```

The API listens on `http://127.0.0.1:8000`.

### Frontend

From the `frontend` directory:

```powershell
npm install
npm run dev
```

The Vite development server listens on `http://127.0.0.1:5173`.

## Environment Variables

Defined in `.env.example`:

```text
GEMINI_API_KEY
GEMINI_MODEL
```

Never commit `.env` or paste a real API key into documentation.

## Usage

1. Enter a name and select one or more dietary conditions.
2. Upload a label or capture a desktop webcam frame.
3. Let OpenCV and EasyOCR extract the label text.
4. Review detected INS/E-codes and mapped additive metadata.
5. Gemini analyzes the label evidence against the selected profile.
6. Review the structured risk result, evidence, explanation, recommendation, and confidence.
7. Expand the extracted OCR text when needed.
8. Review prior scan summaries in history.

## API

### `GET /`

Health response:

```json
{"message":"NutriScan API is running!"}
```

### `POST /scan`

Multipart form fields:

- `image`: uploaded image file
- `diseases`: JSON array of selected profile strings

Example request:

```powershell
curl.exe -X POST http://127.0.0.1:8000/scan `
  -F "image=@tests/assets/test_label.jpg" `
  -F 'diseases=["Diabetes (Type II)","Hypertension / High BP"]'
```

The response includes `success`, `raw_text`, `detected_additives`, `unmapped_additives`, `risk_level`, `overall_hazard`, `evidence`, `explanation`, `explanation_source`, `gemini_analysis`, and the legacy `analysis` compatibility object.

### `GET /history`

Returns recent scan summaries from SQLite. Uploaded images are not stored.

## Reliability and Error Handling

- Images are decoded in memory with OpenCV.
- OCR uses a reusable EasyOCR reader and keeps the raw text available.
- E/INS parsing uses strict token boundaries to avoid converting arbitrary digits inside words into codes.
- Unknown database codes are returned separately as `unmapped_additives`.
- Gemini JSON is parsed and validated before being returned to the frontend.
- Quota errors, unavailable models, malformed JSON, and missing credentials become an explicit unavailable/`UNKNOWN` analysis.
- The current API reports handled scan failures in its JSON response; callers should inspect `success`.

## Limitations

- OCR quality depends on image quality, lighting, focus, and packaging layout.
- Small or stylized text can produce OCR spelling errors.
- Gemini analysis depends on model availability, quota, credentials, and network access.
- Additive coverage depends on the current CSV/PDF-derived knowledge base.
- The application is a dietary decision-support prototype, not a medical diagnostic system.

## Future Scope

- Expanded additive knowledge base
- Improved OCR and multilingual label support
- Nutrition-fact extraction
- Quantity-aware sugar and sodium analysis
- Additional dietary profiles
- Mobile/PWA support
- Stronger regulatory and provenance integrations

## Demo

For the project review, select Diabetes and Hypertension, then upload `tests/assets/test_label.jpg`. The sample label contains an INS 322 reference that should normalize to E322 and map to Lecithins. The scan also demonstrates OCR evidence for sugar, dextrose, glucose-like text, salt, and allergens. Results depend on the current OCR and Gemini response and are not universal or medically definitive.

## License

No license file is currently included. Choose and add an appropriate open-source license before publishing the repository publicly.
