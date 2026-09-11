// OpenAI & Groq Whisper AI High-Precision Audio Recording Engine (Native WAV PCM)

let audioContext = null;
let mediaStreamSource = null;
let scriptProcessor = null;
let micStream = null;
let pcmBuffers = [];
let isWhisperRecording = false;

// Fallback MediaRecorder state
let fallbackMediaRecorder = null;
let fallbackAudioChunks = [];
let useFallbackRecorder = false;

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
    useFallbackRecorder = false;
    pcmBuffers = [];
    fallbackAudioChunks = [];

    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 1. Primary: Try Web Audio API Native PCM WAV Recording (100% compatible with Groq & OpenAI)
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            try {
                // Use browser's native hardware sample rate (e.g. 44100 or 48000) to prevent stalls
                audioContext = new AudioCtx();
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
                mediaStreamSource = audioContext.createMediaStreamSource(micStream);
                // 4096 buffer size, 1 channel in, 1 channel out
                scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                
                scriptProcessor.onaudioprocess = (e) => {
                    if (!isWhisperRecording) return;
                    const inputData = e.inputBuffer.getChannelData(0);
                    pcmBuffers.push(new Float32Array(inputData));
                };

                mediaStreamSource.connect(scriptProcessor);
                scriptProcessor.connect(audioContext.destination);
                onStatusChange(true, "🎙️ Whisper Recording... (Speak now)");
                return;
            } catch (webAudioErr) {
                console.warn("Web Audio API recorder failed, switching to MediaRecorder fallback:", webAudioErr);
            }
        }

        // 2. Fallback: Use MediaRecorder (Monolithic single-blob recording, NO timeslice parameter!)
        useFallbackRecorder = true;
        const mimeType = getSupportedMimeType();
        fallbackMediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : {});
        fallbackMediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                fallbackAudioChunks.push(e.data);
            }
        };
        fallbackMediaRecorder.onstart = () => {
            onStatusChange(true, "🎙️ Whisper Recording... (Speak now)");
        };
        fallbackMediaRecorder.start();

    } catch (err) {
        console.error("Whisper recording error:", err);
        isWhisperRecording = false;
        onStatusChange(false, "Microphone permission denied or device error.");
        alert("Microphone permission denied. Please allow microphone access in your browser address bar.");
    }
}

export function stopWhisperRecording(onStatusChange, onTranscribed, language = 'en') {
    if (!isWhisperRecording) return;
    onStatusChange(true, "🤖 Transcribing with Whisper AI...");
    isWhisperRecording = false;

    if (useFallbackRecorder && fallbackMediaRecorder) {
        // Handle MediaRecorder fallback
        fallbackMediaRecorder.onstop = async () => {
            if (micStream) {
                micStream.getTracks().forEach(track => track.stop());
            }
            const rawMime = getSupportedMimeType() || 'audio/webm';
            let ext = 'webm';
            if (rawMime.includes('mp4') || rawMime.includes('m4a') || rawMime.includes('aac')) ext = 'm4a';
            else if (rawMime.includes('ogg')) ext = 'ogg';
            else if (rawMime.includes('wav')) ext = 'wav';

            const cleanMime = rawMime.split(';')[0].trim();
            const audioBlob = new Blob(fallbackAudioChunks, { type: cleanMime });
            sendAudioToBackend(audioBlob, `speech.${ext}`, language, onStatusChange, onTranscribed);
        };
        fallbackMediaRecorder.stop();
        return;
    }

    // Handle Web Audio PCM WAV Recorder
    const currentSampleRate = audioContext ? audioContext.sampleRate : 44100;

    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor.onaudioprocess = null;
    }
    if (mediaStreamSource) {
        mediaStreamSource.disconnect();
    }
    if (audioContext) {
        audioContext.close().catch(() => {});
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
    }

    // Consolidate PCM samples
    let totalSamples = 0;
    for (let i = 0; i < pcmBuffers.length; i++) {
        totalSamples += pcmBuffers[i].length;
    }

    // Require at least 0.4s of audio
    if (totalSamples < currentSampleRate * 0.4) {
        onStatusChange(false, "Recording too short. Speak longer before stopping.");
        alert("Recording was too short. Please speak into your microphone for at least 1-2 seconds before stopping.");
        return;
    }

    const mergedPCM = new Float32Array(totalSamples);
    let offset = 0;
    for (let i = 0; i < pcmBuffers.length; i++) {
        mergedPCM.set(pcmBuffers[i], offset);
        offset += pcmBuffers[i].length;
    }

    // Build standard 16-bit PCM WAV Blob at native sample rate
    const wavBlob = encodeWAV(mergedPCM, currentSampleRate);
    sendAudioToBackend(wavBlob, "speech.wav", language, onStatusChange, onTranscribed);
}

async function sendAudioToBackend(audioBlob, filename, language, onStatusChange, onTranscribed) {
    if (!audioBlob || audioBlob.size < 100) {
        onStatusChange(false, "Recording too short. Speak longer before stopping.");
        alert("Recording was too short. Please speak into your microphone for at least 1-2 seconds before stopping.");
        return;
    }

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
}

function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk size */
    view.setUint32(4, 36 + samples.length * 2, true);
    /* RIFF format 'WAVE' */
    writeString(view, 8, 'WAVE');
    /* Subchunk1 ID 'fmt ' */
    writeString(view, 12, 'fmt ');
    /* Subchunk1 size 16 for PCM */
    view.setUint32(16, 16, true);
    /* Audio format 1 (PCM) */
    view.setUint16(20, 1, true);
    /* Num channels 1 (Mono) */
    view.setUint16(22, 1, true);
    /* Sample rate */
    view.setUint32(24, sampleRate, true);
    /* Byte rate (sampleRate * numChannels * bitsPerSample/8) */
    view.setUint32(28, sampleRate * 2, true);
    /* Block align (numChannels * bitsPerSample/8) */
    view.setUint16(32, 2, true);
    /* Bits per sample 16 */
    view.setUint16(34, 16, true);
    /* Subchunk2 ID 'data' */
    writeString(view, 36, 'data');
    /* Subchunk2 size */
    view.setUint32(40, samples.length * 2, true);

    // Convert Float32 [-1.0, 1.0] to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function getSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
        'audio/ogg'
    ];
    for (let i = 0; i < types.length; i++) {
        if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return '';
}

export function isWhisperActive() {
    return isWhisperRecording;
}