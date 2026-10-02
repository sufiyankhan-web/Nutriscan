import cv2
import numpy as np

from db_builder import (
    find_known_additives,
    find_unmapped_additives,
    save_scan_history,
)
from llm_engine import analyze_scan_with_gemini
from vision_engine import extract_text_from_image


def scan_image(image_bytes, user_diseases):
    """Process one uploaded image and return the existing scan response payload."""
    if not image_bytes:
        raise ValueError("No image data received")

    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    decoded_image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if decoded_image is None:
        raise ValueError("Unable to decode uploaded image")

    ocr_text = extract_text_from_image(decoded_image)
    detected_additives = find_known_additives(ocr_text, user_diseases)
    unmapped_additives = find_unmapped_additives(ocr_text)
    gemini_analysis = analyze_scan_with_gemini(
        user_diseases,
        ocr_text,
        ocr_text,
        detected_additives,
    )
    overall_hazard = gemini_analysis["risk_level"]
    explanation = gemini_analysis["reasoning"]
    save_scan_history(overall_hazard, detected_additives, explanation)

    return {
        "success": True,
        "raw_text": ocr_text,
        "detected_additives": detected_additives,
        "unmapped_additives": unmapped_additives,
        "overall_hazard": overall_hazard,
        "risk_level": gemini_analysis["risk_level"],
        "evidence": gemini_analysis["evidence"],
        "explanation": explanation,
        "explanation_source": gemini_analysis["explanation_source"],
        "gemini_analysis": gemini_analysis,
        "analysis": {
            "hazard_level": overall_hazard,
            "flagged_ingredients": gemini_analysis["flagged_ingredients"],
            "clinical_reasoning": gemini_analysis["reasoning"],
        },
    }
