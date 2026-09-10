import os
from flask import Flask, jsonify, render_template, send_from_directory
from dotenv import load_dotenv

# Load env variables from .env if present
load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')

@app.after_request
def add_header(response):
    # Only set no-cache on API responses, allow static assets & HTML previews to be cached by social media crawlers
    if 'Cache-Control' not in response.headers:
        response.headers['Cache-Control'] = 'public, max-age=3600'
    
    # Enterprise Security Headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin-allow-popups'
    return response

@app.route('/favicon.ico')
def favicon():
    return send_from_directory('static/images', 'logo.jpg')

@app.route('/logo.jpg')
@app.route('/logo.png')
def root_logo():
    res = send_from_directory('static/images', 'logo.jpg')
    res.headers['Cache-Control'] = 'public, max-age=86400'
    res.headers['Access-Control-Allow-Origin'] = '*'
    return res

@app.route('/google2a35372545172c1b.html')
def google_verification():
    return 'google-site-verification: google2a35372545172c1b.html', 200, {'Content-Type': 'text/html'}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/config', methods=['GET'])
def get_config():
    # Return Firebase config variables from env, or blank if not defined
    config = {
        "apiKey": os.environ.get("FIREBASE_API_KEY", ""),
        "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", ""),
        "projectId": os.environ.get("FIREBASE_PROJECT_ID", ""),
        "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET", ""),
        "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID", ""),
        "appId": os.environ.get("FIREBASE_APP_ID", "")
    }
    return jsonify(config)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() in ['true', '1', 't']
    print(f"Starting Voice-to-Handwriting Notebook server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=debug)
