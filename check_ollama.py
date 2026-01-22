import requests
try:
    resp = requests.get('http://localhost:11434/api/tags')
    print(resp.text)
except Exception as e:
    print(e)
