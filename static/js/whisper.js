// OpenAI Whisper AI MediaRecorder Audio Transcription Engine

let mediaRecorder = null;
let audioChunks = [];
let isWhisperRecording = false;

export function getStoredOpenAIKey() {
    return localStorage.getItem("voice_book_openai_key") || "";
}

export function saveStoredOpenAIKey(key) {
    if (key) {
        localStorage.setItem("voice_book_openai_key", key.trim());
    } else {
        localStorage.removeItem("voice_book_openai_key");
    }
}

export async function startWhisperRecording(onStatusChange) {
    if (isWhisperRecording) return;
    isWhisperRecording = true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        const mimeType = getSupportedMimeType();
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstart = () => {
            onStatusChange(true, "🎙️ Whisper Recording... (Speak now)");
        };

        mediaRecorder.start(250);
    } catch (err) {
        console.error("Whisper recording error:", err);
        isWhisperRecording = false;
        onStatusChange(false, "Microphone permission denied or device error.");
        alert("Microphone permission denied. Please allow microphone access in your browser address bar.");
    }
}

export function stopWhisperRecording(onStatusChange, onTranscribed, language = 'en') {
    if (!mediaRecorder || !isWhisperRecording) return;

    onStatusChange(true, "🤖 Transcribing with Whisper AI...");
    isWhisperRecording = false;

    mediaRecorder.onstop = async () => {
        const rawMime = getSupportedMimeType() || 'audio/webm';
        let ext = 'webm';
        if (rawMime.includes('mp4') || rawMime.includes('m4a') || rawMime.includes('aac')) {
            ext = 'm4a';
        } else if (rawMime.includes('ogg')) {
            ext = 'ogg';
        } else if (rawMime.includes('wav')) {
            ext = 'wav';
        }

        const cleanMime = rawMime.split(';')[0].trim();
        const audioBlob = new Blob(audioChunks, { type: cleanMime });
        
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        if (!audioBlob || audioBlob.size < 100) {
            onStatusChange(false, "Recording too short. Speak longer before stopping.");
            alert("Recording was too short. Please speak into your microphone for at least 1-2 seconds before stopping.");
            return;
        }

        const filename = `recording.${ext}`;
        const formData = new FormData();
        formData.append("audio", audioBlob, filename);
        formData.append("language", language);

        const apiKey = getStoredOpenAIKey();
        const headers = {};
        if (apiKey) {
            headers["X-OpenAI-Key"] = apiKey;
        }

        try {
            const res = await fetch("/api/transcribe-whisper", {
                method: "POST",
                headers: headers,
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                const text = data.text ? data.text.trim() : "";
                if (text) {
                    onTranscribed(text);
                    onStatusChange(false, "Microphone Idle");
                } else {
                    onStatusChange(false, "No clear speech detected.");
                    alert("No clear speech detected in recording. Please speak louder into your microphone.");
                }
            } else {
                onStatusChange(false, data.error || "Whisper transcription failed.");
                alert(data.error || "Whisper transcription failed. Please check your API key.");
            }
        } catch (e) {
            console.error("Whisper API error:", e);
            onStatusChange(false, "Connection error during Whisper transcription.");
        }
    };

    mediaRecorder.stop();
}

function getSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return 'audio/ogg;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    return '';
}

export function isWhisperActive() {
    return isWhisperRecording;
}