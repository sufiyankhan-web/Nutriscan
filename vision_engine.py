import cv2
import easyocr
import numpy as np
import re

_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["en"])
    return _reader

def preprocess_image(image_path):
    image = cv2.imread(image_path)
    if image is None:
        # Fallback: read raw bytes and decode using imdecode
        try:
            with open(image_path, "rb") as f:
                data = f.read()
            arr = np.frombuffer(data, dtype=np.uint8)
            image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            image = None

    if image is None:
        raise FileNotFoundError(f"Unable to read image: {image_path}")

    return preprocess_image_data(image)


def preprocess_image_data(image):
    enlarged = cv2.resize(image, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    grayscale_image = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
    enhanced = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(grayscale_image)
    return cv2.addWeighted(enhanced, 1.35, cv2.GaussianBlur(enhanced, (0, 0), 2), -0.35, 0)


def _read_text(reader, image):
    return " ".join(reader.readtext(image, detail=0)).upper()


def _valid_code_count(text):
    return len(re.findall(r"(?<![A-Z0-9])(?:INS\s*|E)\d{3}(?!\d)", text))


def extract_text_from_image(image):
    reader = _get_reader()
    preprocessed_image = preprocess_image_data(image)
    original_text = _read_text(reader, image)
    preprocessed_text = _read_text(reader, preprocessed_image)
    return max((original_text, preprocessed_text), key=lambda text: (_valid_code_count(text), len(text)))


def extract_text(image_path):
    image = cv2.imread(image_path)
    if image is None:
        try:
            with open(image_path, "rb") as file:
                image = cv2.imdecode(np.frombuffer(file.read(), dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            image = None
    if image is None:
        raise FileNotFoundError(f"Unable to read image: {image_path}")
    return extract_text_from_image(image)


if __name__ == "__main__":
    extracted_text = extract_text("test_label.jpg")
    print(extracted_text)