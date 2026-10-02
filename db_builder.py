import csv
import json
import os
import re
import sqlite3
from datetime import datetime, timezone


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "nutriscan.db")
CSV_PATH = os.path.join(BASE_DIR, "additives.csv")


def initialize_database(db_path=DB_PATH, csv_path=CSV_PATH):
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS additives (
                code TEXT PRIMARY KEY,
                name TEXT,
                functional_class TEXT,
                affected_conditions TEXT,
                base_hazard TEXT,
                clinical_note TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS scan_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                overall_hazard TEXT NOT NULL,
                detected_additives TEXT NOT NULL,
                matched_conditions TEXT NOT NULL,
                explanation TEXT NOT NULL
            )
            """
        )

        with open(csv_path, newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            rows = list(reader)

        connection.executemany(
            """
            INSERT OR REPLACE INTO additives (
                code,
                name,
                functional_class,
                affected_conditions,
                base_hazard,
                clinical_note
            ) VALUES (
                :code,
                :name,
                :functional_class,
                :affected_conditions,
                :base_hazard,
                :clinical_note
            )
            """,
            rows,
        )
        connection.commit()


def _normalize_conditions(value):
    if not value:
        return []

    return [item.strip().lower() for item in value.split("|") if item.strip() and item.strip().lower() != "none"]


def _condition_aliases(value):
    aliases = set()
    for item in _normalize_conditions(value) if "|" in value else [value.strip().lower()]:
        aliases.add(item)
        aliases.update(part.strip() for part in re.split(r"[/()]", item) if part.strip())
    return aliases


def _matched_conditions(affected_conditions, user_diseases):
    selected = set()
    for disease in user_diseases:
        selected.update(_condition_aliases(disease))

    return [
        condition
        for condition in _normalize_conditions(affected_conditions)
        if _condition_aliases(condition) & selected
    ]


def analyze_ingredient(ingredient_code, user_diseases):
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(
            """
            SELECT code, name, functional_class, affected_conditions, base_hazard, clinical_note
            FROM additives
            WHERE code = ?
            """,
            (ingredient_code.strip(),),
        ).fetchone()

    if row is None:
        raise ValueError(f"Ingredient code not found: {ingredient_code}")

    affected_conditions = _normalize_conditions(row["affected_conditions"])
    matched_conditions = _matched_conditions(row["affected_conditions"], user_diseases)

    hazard = row["base_hazard"]
    if matched_conditions:
        hazard = "Red"

    return {
        "code": row["code"],
        "name": row["name"],
        "functional_class": row["functional_class"],
        "affected_conditions": row["affected_conditions"],
        "base_hazard": row["base_hazard"],
        "hazard": hazard,
        "personalized_hazard": hazard,
        "matched_conditions": matched_conditions,
        "clinical_note": row["clinical_note"],
    }


def extract_additive_codes(ocr_text):
    normalized_text = re.sub(r"(?<![A-Z])NS(?=\s*\d{3}(?!\d))", "INS", ocr_text.upper())
    codes = []
    for digits in re.findall(r"(?<![A-Z0-9])(?:INS\s*|E)(\d{3})(?!\d)", normalized_text):
        code = f"E{digits}"
        if code not in codes:
            codes.append(code)
    return codes


def find_known_additives(ocr_text, user_diseases):
    initialize_database()
    codes = extract_additive_codes(ocr_text)
    normalized_text = re.sub(r"[^A-Z0-9 ]", " ", ocr_text.upper())

    with sqlite3.connect(DB_PATH) as connection:
        rows = connection.execute("SELECT code, name FROM additives").fetchall()

    for code, name in rows:
        name_pattern = rf"(?<![A-Z0-9]){re.escape(name.upper())}(?![A-Z0-9])"
        if len(name) >= 5 and re.search(name_pattern, normalized_text) and code not in codes:
            codes.append(code)

    matches = []
    for code in codes:
        try:
            matches.append(analyze_ingredient(code, user_diseases))
        except ValueError:
            continue
    return matches


def find_unmapped_additives(ocr_text):
    initialize_database()
    codes = extract_additive_codes(ocr_text)
    with sqlite3.connect(DB_PATH) as connection:
        known_codes = {row[0] for row in connection.execute("SELECT code FROM additives")}
    return [code for code in codes if code not in known_codes]


def save_scan_history(overall_hazard, detected_additives, explanation):
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO scan_history (
                timestamp, overall_hazard, detected_additives, matched_conditions, explanation
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                datetime.now(timezone.utc).isoformat(),
                overall_hazard,
                json.dumps([
                    {"code": item["code"], "name": item["name"]}
                    for item in detected_additives
                ]),
                json.dumps({
                    item["code"]: item["matched_conditions"]
                    for item in detected_additives
                }),
                explanation,
            ),
        )
        connection.commit()


def get_scan_history(limit=20):
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT id, timestamp, overall_hazard, detected_additives,
                   matched_conditions, explanation
            FROM scan_history
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return [
        {
            "id": row["id"],
            "timestamp": row["timestamp"],
            "overall_hazard": row["overall_hazard"],
            "detected_additives": json.loads(row["detected_additives"]),
            "matched_conditions": json.loads(row["matched_conditions"]),
            "explanation": row["explanation"],
        }
        for row in rows
    ]


if __name__ == "__main__":
    initialize_database()

    healthy_result = analyze_ingredient("E621", [])
    hypertensive_result = analyze_ingredient("E621", ["Hypertension"])

    print("Healthy user hazard for E621:", healthy_result["hazard"])
    print("Hypertension user hazard for E621:", hypertensive_result["hazard"])

    assert healthy_result["hazard"] == "Yellow", healthy_result
    assert hypertensive_result["hazard"] == "Red", hypertensive_result

    print("Database build and hazard analysis checks passed.")