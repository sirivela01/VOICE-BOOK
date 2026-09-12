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

@app.route('/manifest.json')
def web_manifest():
    res = send_from_directory('static', 'manifest.json')
    res.headers['Content-Type'] = 'application/manifest+json; charset=utf-8'
    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers['Cache-Control'] = 'public, max-age=3600'
    return res

@app.route('/sw.js')
@app.route('/service-worker.js')
def service_worker():
    res = send_from_directory('static', 'sw.js')
    res.headers['Content-Type'] = 'application/javascript; charset=utf-8'
    res.headers['Access-Control-Allow-Origin'] = '*'
    res.headers['Cache-Control'] = 'no-cache'
    return res

@app.route('/')
def index():
    return render_template('index.html')

import requests
from flask import request

@app.route('/api/config', methods=['GET'])
def get_config():
    config = {
        "apiKey": os.environ.get("FIREBASE_API_KEY", "AIzaSyDe7EPi-p6b5gnWFTucVC2Mz-LVJTHiI4"),
        "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", "voice-book-5e5f0.firebaseapp.com"),
        "projectId": os.environ.get("FIREBASE_PROJECT_ID", "voice-book-5e5f0"),
        "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET", "voice-book-5e5f0.firebasestorage.app"),
        "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID", "684418710763"),
        "appId": os.environ.get("FIREBASE_APP_ID", "1:684418710763:web:297972050bcab51a4092ae")
    }
    res = jsonify(config)
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    res.headers['Access-Control-Allow-Origin'] = '*'
    return res
CURRENT_APP_VERSION = "v560.0"

@app.route('/api/version', methods=['GET'])
def get_app_version():
    res = jsonify({
        "version": CURRENT_APP_VERSION,
        "commit": os.environ.get("RENDER_GIT_COMMIT", "latest")
    })
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    res.headers['Access-Control-Allow-Origin'] = '*'
    return res

@app.route('/api/transcribe-whisper', methods=['POST'])
def transcribe_whisper():
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided in request"}), 400
    
    audio_file = request.files['audio']
    language = request.form.get('language', 'en')
    lang_code = language.split('-')[0] if (language and '-' in language) else (language or 'en')
    if lang_code == 'auto':
        lang_code = None
    
    client_key = request.headers.get('X-OpenAI-Key') or request.headers.get('X-Groq-Key') or ""
    openai_api_key = os.environ.get("OPENAI_API_KEY", "")
    groq_api_key = os.environ.get("GROQ_API_KEY", "")
    
    if client_key:
        client_key = client_key.strip()
        if client_key.startswith("gsk_"):
            groq_api_key = client_key
            openai_api_key = ""
        elif client_key.startswith("sk-"):
            openai_api_key = client_key
            groq_api_key = ""
        else:
            groq_api_key = client_key
            
    if not openai_api_key and not groq_api_key:
        return jsonify({
            "error": "No API key configured. Please enter your Groq (gsk_...) or OpenAI (sk-...) API key in settings ⚙️ Key."
        }), 400
    
    try:
        raw_filename = audio_file.filename or 'audio_recording.webm'
        file_content = audio_file.read()
        
        if not file_content or len(file_content) < 100:
            return jsonify({"error": "Audio recording was empty or too short. Please speak into your microphone for at least 1-2 seconds."}), 400

        # Magic byte header inspection to guarantee binary payload and extension match
        header = file_content[:64]
        
        if header.startswith(b'RIFF'):
            clean_filename = 'speech.wav'
            content_type = 'audio/wav'
        elif header.startswith(b'\x1a\x45\xdf\xa3'):
            clean_filename = 'recording.webm'
            content_type = 'audio/webm'
        elif header.startswith(b'OggS'):
            clean_filename = 'recording.ogg'
            content_type = 'audio/ogg'
        elif header.startswith(b'fLaC'):
            clean_filename = 'recording.flac'
            content_type = 'audio/flac'
        elif header.startswith(b'ID3') or (len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0):
            clean_filename = 'recording.mp3'
            content_type = 'audio/mp3'
        elif b'ftyp' in header or header.startswith(b'\x00\x00\x00') or (len(header) >= 2 and header[:2] in (b'\xff\xf1', b'\xff\xf9')):
            clean_filename = 'recording.m4a'
            content_type = 'audio/mp4'
        else:
            raw_mime = (audio_file.content_type or '').lower()
            if ';' in raw_mime:
                raw_mime = raw_mime.split(';')[0].strip()
            
            if 'wav' in raw_mime or raw_filename.endswith('.wav'):
                clean_filename = 'speech.wav'
                content_type = 'audio/wav'
            elif 'mp4' in raw_mime or 'm4a' in raw_mime or 'aac' in raw_mime or raw_filename.endswith('.m4a') or raw_filename.endswith('.mp4'):
                clean_filename = 'recording.m4a'
                content_type = 'audio/mp4'
            elif 'ogg' in raw_mime or raw_filename.endswith('.ogg'):
                clean_filename = 'recording.ogg'
                content_type = 'audio/ogg'
            elif 'mp3' in raw_mime or raw_filename.endswith('.mp3'):
                clean_filename = 'recording.mp3'
                content_type = 'audio/mp3'
            else:
                clean_filename = 'recording.webm'
                content_type = 'audio/webm'

        files = {'file': (clean_filename, file_content)}

        # 1. Use OpenAI Whisper API if key is present
        if openai_api_key:
            headers = {"Authorization": f"Bearer {openai_api_key}"}
            payload_data = {'model': 'whisper-1', 'response_format': 'json'}
            if lang_code:
                payload_data['language'] = lang_code
            res = requests.post("https://api.openai.com/v1/audio/transcriptions", headers=headers, data=payload_data, files=files, timeout=35)
            if res.status_code == 200:
                data = res.json()
                return jsonify({"text": data.get("text", "")})
            else:
                return jsonify({"error": f"OpenAI Whisper API Error: {res.text}"}), res.status_code
        
        # 2. Fallback to Groq Whisper API
        elif groq_api_key:
            try:
                from groq import Groq
                client = Groq(api_key=groq_api_key)
                kwargs = {
                    "file": (clean_filename, file_content),
                    "model": "whisper-large-v3",
                    "response_format": "json"
                }
                if lang_code:
                    kwargs["language"] = lang_code
                transcription = client.audio.transcriptions.create(**kwargs)
                text_res = getattr(transcription, 'text', '') or ''
                return jsonify({"text": text_res})
            except Exception as sdk_err:
                print("Groq SDK failed, falling back to direct requests:", sdk_err)
                headers = {"Authorization": f"Bearer {groq_api_key}"}
                payload_data = {'model': 'whisper-large-v3', 'response_format': 'json'}
                if lang_code:
                    payload_data['language'] = lang_code
                files = {'file': (clean_filename, file_content)}
                res = requests.post("https://api.groq.com/openai/v1/audio/transcriptions", headers=headers, data=payload_data, files=files, timeout=35)
                if res.status_code == 200:
                    data = res.json()
                    return jsonify({"text": data.get("text", "")})
                else:
                    return jsonify({"error": f"Groq Whisper API Error: {res.text}"}), res.status_code

    except Exception as e:
        print("Whisper Transcription Exception:", e)
        return jsonify({"error": f"Transcription Failed: {str(e)}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() in ['true', '1', 't']
    print(f"Starting Voice-to-Handwriting Notebook server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=debug)
