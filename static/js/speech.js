// Web Speech API Speech Recognition Wrapper
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isRecording = false;
let lastProcessedIndex = -1;

/**
 * Checks if Speech Recognition is supported by the user's browser.
 * @returns {boolean}
 */
export function isSpeechSupported() {
    return !!SpeechRecognition;
}

/**
 * Initializes and starts the Speech Recognition engine.
 * @param {function(string): void} onWordsAdded Callback when new final words are transcribed
 * @param {function(string): void} onInterimResult Callback for live temporary feedback (interim text)
 * @param {function(boolean, string): void} onStatusChange Callback for status changes (active state, status text)
 */
export function startListening(onWordsAdded, onInterimResult, onStatusChange) {
    if (!isSpeechSupported()) {
        onStatusChange(false, "Speech recognition not supported in this browser. Please use Google Chrome, Safari, or Microsoft Edge.");
        return;
    }

    if (isRecording) return;

    try {
        if (recognition) {
            try { recognition.abort(); } catch(e) {}
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        recognition.maxAlternatives = 1;

        lastProcessedIndex = -1;
        isRecording = true;

        recognition.onstart = () => {
            onStatusChange(true, "Microphone Listening...");
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                onStatusChange(false, "Permission Denied: Allow mic access in your browser address bar.");
                isRecording = false;
            } else if (event.error === 'no-speech') {
                onStatusChange(true, "Listening (Waiting for speech...)...");
            } else if (event.error === 'audio-capture') {
                onStatusChange(false, "Microphone error: Ensure your microphone is plugged in.");
                isRecording = false;
            } else {
                onStatusChange(true, `Mic Status: ${event.error}`);
            }
        };

        recognition.onend = () => {
            if (isRecording) {
                console.log("Speech recognition ended automatically. Restarting...");
                try {
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
