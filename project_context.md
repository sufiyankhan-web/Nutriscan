# NutriScan Developer Context

NutriScan is a React + FastAPI prototype for AI-powered food label intelligence and personalized dietary risk analysis.

## Architecture

```text
React upload/webcam
  -> POST /scan
  -> OpenCV image decode and preprocessing
  -> EasyOCR raw text extraction
  -> strict INS/E-code and ingredient-name matching
  -> SQLite additive metadata lookup
  -> Gemini evidence-based analysis
  -> validated structured JSON
  -> React result
  -> SQLite scan history
```

## Major Modules

| Module | Responsibility |
| --- | --- |
| `api.py` | Creates the FastAPI app, validates multipart input, delegates scan processing, returns `/scan`, and exposes `/history`. |
| `backend/scan_pipeline.py` | Decodes image bytes in memory, orchestrates OCR, additive mapping, Gemini analysis, history persistence, and response assembly. |
| `vision_engine.py` | Reuses an EasyOCR reader, creates a modest enhanced image with OpenCV, evaluates original/enhanced OCR candidates, and returns uppercase raw text. |
| `db_builder.py` | Initializes SQLite from `additives.csv`, extracts strict E/INS codes, matches known additive names, returns unmapped codes, and stores scan history. |
| `llm_engine.py` | Selects `GEMINI_MODEL`, builds the evidence prompt, requests JSON, validates the analysis schema, and handles unavailable/malformed Gemini responses. |
| `frontend/src/App.jsx` | Collects the profile and image, calls `POST /scan`, renders OCR/additive/Gemini results, and loads `/history`. |
| `build_full_db.py` | Rebuilds the larger `additives` table from `additives.csv` and `CXG_036e_2015.pdf`. |

## Request Flow

`POST /scan` accepts an image and a JSON-encoded `diseases` form field. `api.scan()` validates the form value and delegates the image bytes to `backend.scan_pipeline.scan_image()`. The pipeline decodes the image in memory, calls `extract_text_from_image()`, then passes the OCR text and selected conditions to `find_known_additives()` and `find_unmapped_additives()`.

The backend sends Gemini the selected conditions, raw OCR text, normalized ingredient text, and SQLite metadata for detected additives. The response is expected to contain `risk_level`, `summary`, `flagged_ingredients`, `detected_additives`, `condition_assessment`, `evidence`, `reasoning`, `recommendation`, and `confidence`. `_parse_analysis_response()` validates required fields, accepted risk levels, confidence type, and returned additive codes.

The API maps the validated result to the top-level response and retains a legacy `analysis` object for frontend compatibility. It stores a scan summary through `save_scan_history()` and never stores the uploaded image.

## Database Role

SQLite is the additive reference and mapping layer. The `additives` table contains:

```text
code
name
functional_class
affected_conditions
base_hazard
clinical_note
```

`extract_additive_codes()` normalizes forms such as `INS 322` and `INS322` to `E322`. `find_known_additives()` only creates additive records for valid codes or whole-name matches in the database. `find_unmapped_additives()` reports valid codes that have no database row. SQLite metadata provides context to Gemini; Gemini produces the final personalized analysis.

The full 446-record database is generated with `python build_full_db.py`. The generated `nutriscan.db` is local and ignored by Git.

## Gemini Role

Gemini receives the profile, raw OCR, normalized text, detected codes, and SQLite metadata. The prompt asks it to consider supported evidence such as sugar, glucose, dextrose, salt/sodium, allergens, and detected additives. It must return the structured JSON analysis without inventing unsupported codes or ingredients.

`GEMINI_MODEL` is read from `.env`; `.env.example` uses `gemini-3.5-flash-lite`. Missing credentials, quota errors, unavailable models, malformed JSON, and other generation failures return an explicit `UNKNOWN`/unavailable analysis rather than crashing the request.

## Important Decisions

- Image bytes are decoded in memory; `memory_buffer.jpg` is not part of the current pipeline.
- OCR text is retained for inspection and evidence.
- Strict code boundaries prevent words such as `HYDROGENATED` from becoming additive codes.
- Whole-name matching prevents database names from matching inside larger words.
- SQLite supplies additive context, while Gemini performs the final profile-aware analysis.
- The frontend keeps a legacy analysis mapping while consuming the structured Gemini fields.
- Scan history stores summaries and explanations, not uploaded images.

## Testing Approach

The real-image smoke test is `scripts/test_scan.py` and uses `tests/assets/test_label.jpg`. It posts Diabetes and Hypertension conditions to the live API and reports status, success, risk level, detected codes, and explanation source.

Useful checks:

```powershell
.\.venv\Scripts\python.exe -m py_compile api.py db_builder.py vision_engine.py llm_engine.py
python scripts/test_scan.py
cd frontend
npm run lint
npm run build
```

## Known Limitations

- OCR depends on image quality and packaging layout.
- OCR can contain spelling errors in ingredient names.
- Gemini output depends on API credentials, model availability, quota, and network access.
- Additive coverage depends on the current CSV/PDF-derived dataset.
- The project is a dietary decision-support prototype, not a medical diagnostic system.
