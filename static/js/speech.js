// Web Speech API Speech Recognition Wrapper with Mobile Duplication Shield
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isRecording = false;
let lastProcessedIndex = -1;
let lastEmittedText = "";

/**
 * Checks if Speech Recognition is supported by the user's browser.
 * @returns {boolean}
 */
export function isSpeechSupported() {
    return !!SpeechRecognition;
}

/**
 * Removes consecutive duplicate words from a string (e.g., "currently currently" -> "currently").
 */
function cleanDeduplicatedWords(str) {
    if (!str) return "";
    const words = str.split(/\s+/);
    const result = [];
    for (let i = 0; i < words.length; i++) {
        if (i > 0 && words[i].toLowerCase() === words[i - 1].toLowerCase()) {
            continue;
        }
        result.push(words[i]);
    }
    return result.join(" ");
}

/**
 * Extracts only NEW delta text from incoming speech transcripts,
 * preventing Mobile Chrome duplicate accumulated speech bug.
 */
function getNewDeltaText(incomingText) {
    const cleanIncoming = incomingText.trim();
    if (!cleanIncoming) return "";

    // 1. If exact match with last emitted reference, ignore
    if (cleanIncoming.toLowerCase() === lastEmittedText.toLowerCase()) {
        return "";
    }

    // 2. If incoming text starts with lastEmittedText, extract trailing delta
    if (lastEmittedText && cleanIncoming.toLowerCase().startsWith(lastEmittedText.toLowerCase())) {
        const delta = cleanIncoming.substring(lastEmittedText.length).trim();
        if (delta) {
            lastEmittedText = cleanIncoming;
            return cleanDeduplicatedWords(delta);
        }
        return "";
    }

    // 3. Overlap matching for trailing/leading word sequences
    const wordsIncoming = cleanIncoming.split(/\s+/);
    const wordsLast = lastEmittedText.split(/\s+/);

    let overlapCount = 0;
    for (let k = Math.min(wordsLast.length, wordsIncoming.length); k > 0; k--) {
        const lastTail = wordsLast.slice(wordsLast.length - k).join(" ").toLowerCase();
        const incomingHead = wordsIncoming.slice(0, k).join(" ").toLowerCase();
        if (lastTail === incomingHead) {
            overlapCount = k;
            break;
        }
    }

    if (overlapCount > 0) {
        const deltaWords = wordsIncoming.slice(overlapCount);
        if (deltaWords.length > 0) {
            const deltaStr = deltaWords.join(" ");
            lastEmittedText = (lastEmittedText + " " + deltaStr).slice(-300);
            return cleanDeduplicatedWords(deltaStr);
        }
        return "";
    }

    // 4. Brand new phrase
    lastEmittedText = cleanIncoming.slice(-300);
    return cleanDeduplicatedWords(cleanIncoming);
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
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        // Mobile Chrome works far better with continuous=false to prevent cumulative result re-emissions
        recognition.continuous = !isMobile;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';
        recognition.maxAlternatives = 1;

        lastProcessedIndex = -1;
        lastEmittedText = "";
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
                console.log("Speech session ended. Auto-restarting...");
                setTimeout(() => {
                    if (isRecording) {
                        try {
                            recognition.start();
                        } catch (e) {
                            console.warn("Speech restart notice:", e);
                        }
                    }
                }, 150);
            } else {
                onStatusChange(false, "Microphone Idle");
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalAccumulated = '';

            for (let i = 0; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    if (i > lastProcessedIndex) {
                        finalAccumulated += (finalAccumulated ? ' ' : '') + transcript.trim();
                        lastProcessedIndex = i;
                    }
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalAccumulated) {
                const deltaText = getNewDeltaText(finalAccumulated);
                if (deltaText) {
                    onWordsAdded(deltaText);
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
    lastEmittedText = "";
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
