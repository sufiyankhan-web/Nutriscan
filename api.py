import json

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.scan_pipeline import scan_image
from db_builder import get_scan_history, initialize_database

app = FastAPI(title="NutriScan API")
initialize_database()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "NutriScan API is running!"}


@app.post("/scan")
async def scan(image: UploadFile = File(...), diseases: str = Form(...)):
    try:
        user_diseases = json.loads(diseases)
        if not isinstance(user_diseases, list):
            raise ValueError("diseases must be a JSON list")

        return scan_image(await image.read(), user_diseases)
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@app.get("/history")
def history():
    return {"success": True, "history": get_scan_history()}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)