import json
from pathlib import Path
import requests

url = 'http://127.0.0.1:8000/scan'
image_path = Path(__file__).parent.parent / 'tests' / 'assets' / 'test_label.jpg'
data = {'diseases': json.dumps(['Diabetes (Type II)', 'Hypertension / High BP'])}

with image_path.open('rb') as image_file:
    response = requests.post(
        url,
        files={'image': (image_path.name, image_file, 'image/jpeg')},
        data=data,
        timeout=180,
    )

payload = response.json()
print('STATUS:', response.status_code)
print('SUCCESS:', payload.get('success'))
print('RISK_LEVEL:', payload.get('risk_level'))
print('DETECTED_CODES:', [item.get('code') for item in payload.get('detected_additives', [])])
print('EXPLANATION_SOURCE:', payload.get('explanation_source'))
