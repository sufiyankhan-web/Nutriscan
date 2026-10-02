import json
import os
import tempfile

import cv2
import streamlit as st

from db_builder import analyze_ingredient, initialize_database
from llm_engine import analyze_unmapped_text
from vision_engine import extract_text


def save_uploaded_image(uploaded_file):
    suffix = os.path.splitext(uploaded_file.name)[1] if getattr(uploaded_file, "name", None) else ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(uploaded_file.getbuffer())
        return temp_file.name


def find_known_additives(ocr_text):
    tokens = [token.strip(".,:;()[]{}<>\"' ") for token in ocr_text.replace("\n", " ").split()]
    matches = []

    for token in tokens:
        normalized_token = token.upper().replace(" ", "")
        if normalized_token.startswith("INS"):
            normalized_token = normalized_token.replace("INS", "E", 1)

        if normalized_token.startswith("E") and any(character.isdigit() for character in normalized_token):
            try:
                matches.append(analyze_ingredient(normalized_token, user_diseases))
            except ValueError:
                continue

    unique_matches = []
    seen_codes = set()
    for match in matches:
        if match["code"] not in seen_codes:
            seen_codes.add(match["code"])
            unique_matches.append(match)

    return unique_matches


st.set_page_config(page_title="NutriScan", page_icon="🥗", layout="wide")
initialize_database()

st.sidebar.title("👤 User Health Profile")
condition_options = ["Diabetes", "Hypertension", "Nut Allergy", "Asthma", "PKU", "IBS"]
user_diseases = [condition for condition in condition_options if st.sidebar.checkbox(condition)]

st.title("🥗 NutriScan: Intelligent Ingredient Auditor")
st.caption("Barcode-free ingredient checking for food labels using computer vision, local additive lookup, and Gemini-powered clinical risk analysis.")

uploaded_image = st.file_uploader("Upload Label Image", type=["jpg", "png", "jpeg"])
captured_image = st.camera_input("Or Snap a Photo")

image_source = uploaded_image or captured_image

if image_source is not None:
    temp_image_path = save_uploaded_image(image_source)

    try:
        with st.spinner("🔍 Extracting Text via Computer Vision..."):
            ocr_text = extract_text(temp_image_path)

        with st.expander("Show Extracted Raw OCR Text"):
            st.text(ocr_text)

        known_additive_results = find_known_additives(ocr_text)
        if known_additive_results:
            st.subheader("Local Database Matches")
            for additive_result in known_additive_results:
                if additive_result["hazard"] == "Red":
                    st.error(f"{additive_result['code']} - {additive_result['name']} : DANGER")
                elif additive_result["hazard"] == "Yellow":
                    st.warning(f"{additive_result['code']} - {additive_result['name']} : CAUTION")
                else:
                    st.success(f"{additive_result['code']} - {additive_result['name']} : SAFE")
                st.write(additive_result["clinical_note"])

        with st.spinner("🧠 Performing Clinical Risk Analysis..."):
            llm_result = analyze_unmapped_text(ocr_text, user_diseases)

        hazard_level = llm_result.get("hazard_level", "Green")
        flagged_ingredients = llm_result.get("flagged_ingredients", [])
        clinical_reasoning = llm_result.get("clinical_reasoning", "No reasoning returned.")

        if hazard_level == "Red":
            st.error("🔴 DANGER DETECTED")
            st.write(clinical_reasoning)
            st.write("Flagged Ingredients:", flagged_ingredients)
        elif hazard_level == "Yellow":
            st.warning("🟡 WARNING / CAUTION")
            st.write(clinical_reasoning)
            st.write("Flagged Ingredients:", flagged_ingredients)
        elif hazard_level == "Green":
            st.success("🟢 SAFE TO CONSUME")
            st.write(clinical_reasoning)
        else:
            st.info("Unexpected hazard level returned by Gemini.")
            st.json(llm_result)

        with st.expander("Show Gemini JSON Output"):
            st.json(llm_result)

    finally:
        if os.path.exists(temp_image_path):
            os.remove(temp_image_path)
else:
    st.info("Upload or capture a food label to start scanning.")
