import google.generativeai as genai
import os

# usage: python test_key.py "KEY_HERE"

import sys

if len(sys.argv) < 2:
    print("Usage: python test_key.py <API_KEY>")
    sys.exit(1)

key = sys.argv[1]
print(f"Testing Key: {key[:10]}...{key[-5:]}")

genai.configure(api_key=key)

try:
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content("Hello")
    print("SUCCESS!")
    print(response.text)
except Exception as e:
    print("FAILURE!")
    print(e)
