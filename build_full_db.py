import csv
import sqlite3

import pdfplumber


PDF_PATH = "CXG_036e_2015.pdf"
CSV_PATH = "additives.csv"
DB_PATH = "nutriscan.db"


def extract_codex_data(pdf_path):
    codex_rows = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue

                for row in table:
                    if not row or len(row) < 3:
                        continue

                    raw_code = (row[0] or "").strip()
                    name = (row[1] or "").strip()
                    functional_class = (row[2] or "").strip()

                    if not raw_code or not raw_code.isdigit():
                        continue

                    codex_rows.append(
                        {
                            "code": f"E{raw_code}",
                            "name": name,
                            "functional_class": functional_class,
                        }
                    )

    return codex_rows


def build_database():
    csv_medical_data = {}

    with open(CSV_PATH, newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            csv_medical_data[row["code"].strip()] = {
                "affected_conditions": row["affected_conditions"].strip(),
                "base_hazard": row["base_hazard"].strip(),
                "clinical_note": row["clinical_note"].strip(),
            }

    codex_data = extract_codex_data(PDF_PATH)
    unique_codex_data = []
    seen_codes = set()

    for row in codex_data:
        if row["code"] in seen_codes:
            continue

        seen_codes.add(row["code"])
        unique_codex_data.append(row)

    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("DROP TABLE IF EXISTS additives")
        connection.execute(
            """
            CREATE TABLE additives (
                code TEXT PRIMARY KEY,
                name TEXT,
                functional_class TEXT,
                affected_conditions TEXT,
                base_hazard TEXT,
                clinical_note TEXT
            )
            """
        )

        inserted_rows = 0
        for row in unique_codex_data:
            medical_data = csv_medical_data.get(
                row["code"],
                {
                    "affected_conditions": "None",
                    "base_hazard": "Unknown",
                    "clinical_note": "Pending AI clinical review",
                },
            )

            connection.execute(
                """
                INSERT INTO additives (
                    code,
                    name,
                    functional_class,
                    affected_conditions,
                    base_hazard,
                    clinical_note
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    row["code"],
                    row["name"],
                    row["functional_class"],
                    medical_data["affected_conditions"],
                    medical_data["base_hazard"],
                    medical_data["clinical_note"],
                ),
            )
            inserted_rows += 1

        connection.commit()

    return inserted_rows


if __name__ == "__main__":
    total_rows = build_database()
    print(f"Total rows inserted: {total_rows}")