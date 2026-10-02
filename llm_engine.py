import google.generativeai as genai
import os
import json
from dotenv import load_dotenv

# Load the API key from your .env file
load_dotenv()
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"


def _gemini_model_name():
    return os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)


def _is_quota_error(error):
    message = str(error).upper()
    return any(marker in message for marker in ("429", "RESOURCE_EXHAUSTED", "QUOTA EXCEEDED"))


def _analysis_unavailable(reason):
    return {
        "risk_level": "UNKNOWN",
        "summary": "Personalized dietary analysis is unavailable for this scan.",
        "flagged_ingredients": [],
        "detected_additives": [],
        "condition_assessment": [],
        "evidence": [],
        "reasoning": reason,
        "recommendation": "Review the label manually or rescan when analysis is available.",
        "confidence": 0.0,
        "explanation_source": "analysis_unavailable",
    }


def _parse_analysis_response(response_text, detected_additives):
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    payload = json.loads(cleaned)
    required = (
        "risk_level", "summary", "flagged_ingredients", "detected_additives",
        "condition_assessment", "evidence", "reasoning", "recommendation", "confidence",
    )
    if any(field not in payload for field in required):
        raise ValueError("Gemini response did not match the required analysis schema")
    if payload["risk_level"] not in {"LOW", "MODERATE", "HIGH", "UNKNOWN"}:
        raise ValueError("Invalid Gemini risk level")
    if not isinstance(payload["confidence"], (int, float)):
        raise ValueError("Invalid Gemini confidence")

    allowed_codes = {item["code"] for item in detected_additives}
    payload["flagged_ingredients"] = [
        item for item in payload["flagged_ingredients"]
        if isinstance(item, str) and (item in allowed_codes or item.upper() not in {code.upper() for code in allowed_codes})
    ]
    payload["detected_additives"] = [
        item for item in payload["detected_additives"]
        if isinstance(item, str) and item in allowed_codes
    ]
    payload["confidence"] = max(0.0, min(1.0, float(payload["confidence"])))
    payload["explanation_source"] = "gemini"
    return payload


def analyze_scan_with_gemini(user_diseases, raw_ocr_text, normalized_ingredient_text, detected_additives):
    if not os.environ.get("GEMINI_API_KEY"):
        return _analysis_unavailable("Gemini credentials are not configured.")

    model = genai.GenerativeModel(
        _gemini_model_name(),
        generation_config={"response_mime_type": "application/json"},
    )
    prompt = f"""
Analyze this food-label scan against the selected dietary conditions.
Use only the supplied OCR text and SQLite metadata. Do not invent ingredients, codes, additives, or evidence.
Return UNKNOWN when the OCR/evidence is insufficient.
Consider sugar, glucose, dextrose, sodium/salt, allergens, and supplied additives when present.

Selected dietary conditions: {json.dumps(user_diseases)}
Complete raw OCR text: {raw_ocr_text}
Normalized ingredient text: {normalized_ingredient_text}
Detected valid INS/E codes and SQLite metadata: {json.dumps(detected_additives)}

Return ONLY JSON matching exactly:
{{
  "risk_level": "LOW | MODERATE | HIGH | UNKNOWN",
  "summary": "...",
  "flagged_ingredients": [],
  "detected_additives": [],
  "condition_assessment": [],
  "evidence": [],
  "reasoning": "...",
  "recommendation": "...",
  "confidence": 0.0
}}
"""

    try:
        response = model.generate_content(prompt)
        return _parse_analysis_response(response.text, detected_additives)
    except Exception as error:
        if _is_quota_error(error):
            return _analysis_unavailable("Gemini quota is exhausted for this scan.")
        return _analysis_unavailable("Gemini returned an invalid or unavailable analysis.")


def _fallback_explanation(detected_additives, overall_hazard):
    if not detected_additives:
        return "No recognized additive risks detected. The local NutriScan rule engine found no matching database additives in the OCR output."

    details = []
    for additive in detected_additives:
        matched = additive.get("matched_conditions") or []
        condition_text = ", ".join(matched) if matched else "no selected condition"
        details.append(
            f'{additive["code"]} was detected and matched {condition_text}. '
            f'The local NutriScan rule engine classified the additive as {additive["personalized_hazard"]}.'
        )

    return " ".join(details)

def analyze_unmapped_text(ocr_text, user_diseases):
    """
    Sends noisy OCR text to Gemini. 
    Forces Gemini to fix typos, extract ingredients, and return strict JSON.
    """
    model = genai.GenerativeModel(
        _gemini_model_name(),
        # This configuration forces the AI to output machine-readable JSON
        generation_config={"response_mime_type": "application/json"}
    )
    
    prompt = f"""
    Act as a clinical dietary auditor. 
    1. Fix any OCR spelling errors in this noisy text: {ocr_text}
    2. Extract only the actual food ingredients.
    3. The user suffers from these medical conditions: {user_diseases}.
    4. Evaluate if these ingredients are dangerous for the user's specific conditions.
    
    Return ONLY a valid JSON object matching EXACTLY this schema:
    {{
        "hazard_level": "Red", "Yellow", or "Green",
        "flagged_ingredients": ["list", "of", "bad", "items"],
        "clinical_reasoning": "Short string explaining exactly why it is flagged."
    }}
    """
    
    response = model.generate_content(prompt)
    
    try:
        # Convert the string response into a Python dictionary
        return json.loads(response.text)
    except Exception as e:
        return {"error": "Failed to parse JSON", "raw_response": response.text}


def explain_deterministic_results(ocr_text, user_diseases, detected_additives, overall_hazard, evidence):
    fallback = _fallback_explanation(detected_additives, overall_hazard)
    if not os.environ.get("GEMINI_API_KEY"):
        return {"explanation": fallback, "explanation_source": "deterministic_fallback"}

    model = genai.GenerativeModel(
        _gemini_model_name(),
        generation_config={"response_mime_type": "application/json"},
    )
    prompt = f"""
Explain this deterministic food-label audit in one concise paragraph.
The local SQLite rule engine is the only source of truth for risk. Do not calculate, change, or reinterpret the hazard level.
Do not add, remove, or rename any detected additive or condition. Use only the supplied evidence.
OCR text: {ocr_text}
Selected conditions: {user_diseases}
Detected additives: {detected_additives}
Overall hazard: {overall_hazard}
Evidence: {evidence}

Return only JSON with this exact schema:
{{"explanation": "..."}}
"""

    try:
        response = model.generate_content(prompt)
        payload = json.loads(response.text)
        return {
            "explanation": payload.get("explanation") or fallback,
            "explanation_source": "gemini",
        }
    except Exception as error:
        if _is_quota_error(error):
            return {"explanation": fallback, "explanation_source": "deterministic_fallback"}
        return {"explanation": fallback, "explanation_source": "deterministic_fallback"}

if __name__ == "__main__":
    # Testing the engine with the noisy output from the chocolate bar scan
    noisy_text = "PACIED WITH HUTS, CHEHT CABAHEL AAD ASLAD OF HOIGIT, ALL COTEDED H4 CHOCOLITE. INGREDIENTS: MILICHOCOBATECOATING(395]"
    
    test_diseases = ["Diabetes", "Nut Allergy"]
    
    print(f"Sending noisy text to Gemini for a user with {test_diseases}...\n")
    result = analyze_unmapped_text(noisy_text, test_diseases)
    
    # Print the clean, structured JSON
    print(json.dumps(result, indent=4))