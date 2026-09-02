// Web Speech API Speech Recognition Wrapper
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isRecording = false;
let lastProcessedIndex = -1;
let mediaStream = null;
let currentMicMode = "far"; // "far" (long distance) or "normal"

export function setMicSensitivityMode(mode) {
    currentMicMode = mode;
}

/**
 * Configures browser audio stream for far-field / long-distance voice capture.
 */
export async function requestFarFieldAudioStream(mode = "far") {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    // Far-field mode disables aggressive noise suppression so distant speech isn't muted as background noise
                    noiseSuppression: mode === "far" ? false : true,
                    // Maximize automatic gain control to amplify faint/far-away voice signals
                    autoGainControl: true,
                    channelCount: 1
                }
            };
            
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
            }

            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log(`Microphone far-field stream initialized in '${mode}' mode.`);
        } catch (e) {
            console.warn("Custom mediaStream constraints failed, falling back to default mic:", e);
        }
    }
}

/**
 * Checks if Speech Recognition is supported by the user's browser.
 * @returns {boolean}
 */
export function isSpeechSupported() {
    return !!SpeechRecognition;
}

/**
 * Initializes and starts the Speech Recognition engine.
 */
export async function startListening(onWordsAdded, onInterimResult, onStatusChange) {
    if (!isSpeechSupported()) {
        onStatusChange(false, "Speech recognition not supported in this browser. Please use Google Chrome, Safari, or Microsoft Edge.");
        return;
    }

    if (isRecording) return;

    // Request far-field optimized audio stream
    await requestFarFieldAudioStream(currentMicMode);

    try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        lastProcessedIndex = -1;
        isRecording = true;

        recognition.onstart = () => {
            onStatusChange(true, "Microphone Listening...");
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'not-allowed') {
                onStatusChange(false, "Permission Denied: Allow mic access in your browser settings.");
                isRecording = false;
            } else if (event.error === 'no-speech') {
                // Silently ignore or show passive status; onend will trigger restart
                onStatusChange(true, "Listening (No speech detected)...");
            } else {
                onStatusChange(true, `Mic Status: ${event.error}`);
            }
        };

        recognition.onend = () => {
            // SpeechRecognition often auto-stops after silence or a few minutes.
            // If the user hasn't explicitly clicked stop, auto-restart it.
            if (isRecording) {
                console.log("Speech recognition stopped automatically. Restarting...");
                try {
                    // Reset processed index because the transcript index starts over on restart
                    lastProcessedIndex = -1;
                    recognition.start();
                } catch (e) {
                    console.error("Failed to auto-restart speech recognition:", e);
                }
            } else {
                onStatusChange(false, "Microphone Idle");
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let newFinals = [];

            for (let i = 0; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    if (i > lastProcessedIndex) {
                        newFinals.push(event.results[i][0].transcript.trim());
                        lastProcessedIndex = i;
                    }
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (newFinals.length > 0) {
                const newText = newFinals.join(' ');
                if (newText) {
                    onWordsAdded(newText);
                }
            }

            // Pass interim results for real-time visualization in the sidebar
            onInterimResult(interimTranscript);
        };

        recognition.start();

    } catch (e) {
        console.error("Speech initialization error:", e);
        onStatusChange(false, `Initialization Error: ${e.message}`);
        isRecording = false;
    }
}

/**
 * Stops speech recognition.
 */
export function stopListening() {
    isRecording = false;
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (recognition) {
        try {
            recognition.stop();
        } catch (e) {
            console.error("Failed to stop speech recognition:", e);
        }
    }
}

/**
 * Checks if the mic is currently active.
 * @returns {boolean}
 */
export function isMicActive() {
    return isRecording;
}
