import { getPRNG } from "./utils.js";

const VIRTUAL_WIDTH = 800;
const VIRTUAL_HEIGHT = 1000;

let canvas = null;
let ctx = null;

// Layout config
const config = {
    topMargin: 110,
    bottomMargin: 70,
    leftMargin: 95,
    rightMargin: 740,
    lineSpacing: 34,
    inkColor: "#1d3d84", // Premium ballpoint/fountain blue
};

// Jitter configurations by level
const jitterSettings = {
    0: { rotation: 0, wobble: 0, scale: 0, spacing: 0 },         // None
    1: { rotation: 0.6, wobble: 0.6, scale: 0.02, spacing: 0.3 },  // Low
    2: { rotation: 1.5, wobble: 1.4, scale: 0.04, spacing: 0.8 },  // Medium (Default)
    3: { rotation: 3.2, wobble: 2.8, scale: 0.08, spacing: 1.8 }   // High
};

let currentJitterLevel = 2; // Default to Medium
let currentFont = "Homemade Apple";
let currentFontSize = 23;
let pageText = "";
let bookId = "preview";
let pageNumber = 1;

// Animation state
let charPositions = [];
let overflowText = "";
let animatedCharCount = 0;
let isAnimating = false;
let onPageFullCallback = null;
let onAnimationCompleteCallback = null;

/**
 * Initializes the renderer with the target canvas element.
 * @param {HTMLCanvasElement} canvasElement 
 */
export function initRenderer(canvasElement) {
    canvas = canvasElement;
    
    // Scale canvas backing store for High-DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VIRTUAL_WIDTH * dpr;
    canvas.height = VIRTUAL_HEIGHT * dpr;
    
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Trigger initial render
    drawPage();
}

/**
 * Sets current styling options and redraws immediately.
 */
export function setRenderOptions({ font, fontSize, jitterLevel, activeBookId, activePageNumber }) {
    if (font !== undefined) currentFont = font;
    if (fontSize !== undefined) currentFontSize = fontSize;
    if (jitterLevel !== undefined) currentJitterLevel = jitterLevel;
    if (activeBookId !== undefined) bookId = activeBookId;
    if (activePageNumber !== undefined) pageNumber = activePageNumber;
    
    recalculateLayout();
    drawPage();
}

/**
 * Loads text onto the page and sets up typing animation.
 * @param {string} text The full text content to render
 * @param {boolean} animate Whether to write it progressively
 * @param {function(string): void} onPageFull Callback triggered if text overflows this page
 * @param {function(): void} onComplete Callback triggered when animation finishes
 */
export function renderText(text, animate = false, onPageFull = null, onComplete = null) {
    pageText = text;
    onPageFullCallback = onPageFull;
    onAnimationCompleteCallback = onComplete;

    recalculateLayout();

    if (animate) {
        if (!isAnimating) {
            // Start progressive drawing from current drawn char length
            isAnimating = true;
            tickAnimation();
        }
    } else {
        animatedCharCount = charPositions.length;
        isAnimating = false;
        drawPage();
        checkOverflowStatus();
    }
}

/**
 * Appends new transcription words to the page text and continues animating.
 */
export function appendText(newText, onPageFull = null) {
    if (onPageFull) onPageFullCallback = onPageFull;
    
    const separator = pageText.length > 0 && !pageText.endsWith(" ") ? " " : "";
    pageText = pageText + separator + newText;
    
    recalculateLayout();
    
    if (!isAnimating) {
        isAnimating = true;
        tickAnimation();
    }
}

/**
 * Erases the page and resets text state.
 */
export function clearPage() {
    pageText = "";
    charPositions = [];
    overflowText = "";
    animatedCharCount = 0;
    isAnimating = false;
    drawPage();
}

/**
 * Returns the current text content of the page.
 */
export function getPageText() {
    return pageText;
}

/**
 * Returns any text that did not fit on this page.
 */
export function getOverflowText() {
    return overflowText;
}

/**
 * Recalculates exact character placements on the page based on text-wrapping.
 */
function recalculateLayout() {
    if (!ctx) return;

    ctx.font = `${currentFontSize}px "${currentFont}"`;
    
    const words = pageText.split(/(\s+)/); // Keep whitespace chunks as words
    const layout = [];
    let lineIndex = 0;
    let cursorX = config.leftMargin + 12; // Start with small indent
    
    const maxLines = Math.floor((VIRTUAL_HEIGHT - config.topMargin - config.bottomMargin) / config.lineSpacing);
    let isFull = false;
    let overflowIndex = -1;
    let textProcessed = "";

    for (let w = 0; w < words.length; w++) {
        const word = words[w];
        if (word === "") continue;

        // Check if word is newline
        if (word.includes('\n')) {
            const newlines = word.split('\n').length - 1;
            lineIndex += newlines;
            cursorX = config.leftMargin + 12;
            
            if (lineIndex >= maxLines) {
                isFull = true;
                // Capture index of overflow text
                overflowIndex = pageText.indexOf(word, textProcessed.length);
                break;
            }
            textProcessed += word;
            continue;
        }

        // Measure word
        const wordWidth = ctx.measureText(word).width;
        
        // Wrap line if it exceeds margins (excluding trailing whitespace)
        if (!/^\s+$/.test(word) && cursorX + wordWidth > config.rightMargin) {
            cursorX = config.leftMargin + 12;
            lineIndex++;
        }

        // Check if page capacity is exceeded
        if (lineIndex >= maxLines) {
            isFull = true;
            overflowIndex = pageText.indexOf(word, textProcessed.length);
            break;
        }

        // Calculate positions for each character in this word segment
        let wordX = cursorX;
        const lineY = config.topMargin + lineIndex * config.lineSpacing + (config.lineSpacing * 0.72); // baseline

        // Seeded randomness for variable spacing
        const seedStr = `${bookId}_${pageNumber}_word_${w}`;
        const prng = getPRNG(seedStr);
        const jitter = jitterSettings[currentJitterLevel];

        for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charWidth = ctx.measureText(char).width;
            
            layout.push({
                char: char,
                x: wordX,
                y: lineY,
                lineIndex: lineIndex,
                wordIndex: w,
                charIndex: c
            });

            // Advance cursor per character with small variable spacing jitter
            const spacingJitter = (prng() - 0.5) * jitter.spacing;
            wordX += charWidth + spacingJitter;
        }

        cursorX = wordX;
        textProcessed += word;
    }

    charPositions = layout;

    if (isFull && overflowIndex !== -1) {
        overflowText = pageText.substring(overflowIndex).trim();
        pageText = pageText.substring(0, overflowIndex);
    } else {
        overflowText = "";
    }
}

/**
 * Core loop executing the character progression typewriter animation.
 */
function tickAnimation() {
    if (!isAnimating) return;

    // Adjust writing speed: write roughly 0.4 to 0.8 letters per frame (feels very natural)
    const baseSpeed = currentFont === "Reenie Beanie" ? 0.9 : 0.45;
    animatedCharCount += baseSpeed;

    if (animatedCharCount >= charPositions.length) {
        animatedCharCount = charPositions.length;
        isAnimating = false;
        drawPage();
        
        // Check for complete writing and triggers
        checkOverflowStatus();
        if (onAnimationCompleteCallback) {
            onAnimationCompleteCallback();
        }
    } else {
        drawPage();
        requestAnimationFrame(tickAnimation);
    }
}

/**
 * Triggers callback if text overflows page.
 */
function checkOverflowStatus() {
    if (overflowText.length > 0 && onPageFullCallback) {
        const remaining = overflowText;
        overflowText = ""; // Clear so it doesn't trigger repeatedly
        
        setTimeout(() => {
            onPageFullCallback(remaining);
        }, 600); // Small pause for realism before turning page
    }
}

/**
 * Draws the entire notebook background, ruled lines, margins, and text characters.
 */
function drawPage() {
    if (!ctx) return;

    // Clear Canvas
    ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    // 1. Draw Ruled Lines
    ctx.strokeStyle = "rgba(166, 196, 240, 0.45)"; // Soft ruled blue lines
    ctx.lineWidth = 1;
    
    const maxLines = Math.floor((VIRTUAL_HEIGHT - config.topMargin - config.bottomMargin) / config.lineSpacing);
    for (let i = 0; i < maxLines; i++) {
        const y = config.topMargin + i * config.lineSpacing;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(VIRTUAL_WIDTH, y);
        ctx.stroke();
    }

    // 2. Draw Left Margin Line
    ctx.strokeStyle = "rgba(225, 95, 95, 0.65)"; // Soft margin red line
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(config.leftMargin, 0);
    ctx.lineTo(config.leftMargin, VIRTUAL_HEIGHT);
    ctx.stroke();

    // 3. Draw Header Lines/Boxes (Page & Date indicators in top-right)
    ctx.strokeStyle = "rgba(166, 196, 240, 0.4)";
    ctx.lineWidth = 1;
    
    // Page index box
    ctx.strokeRect(VIRTUAL_WIDTH - 190, 35, 140, 32);
    ctx.font = "11px 'Inter', sans-serif";
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillText("PAGE:", VIRTUAL_WIDTH - 180, 55);
    ctx.font = "14px 'Inter', sans-serif";
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillText(pageNumber.toString(), VIRTUAL_WIDTH - 135, 56);

    // 4. Draw Handwritten Text Characters
    ctx.font = `${currentFontSize}px "${currentFont}"`;
    ctx.fillStyle = config.inkColor;
    ctx.textBaseline = "alphabetic";

    const jitter = jitterSettings[currentJitterLevel];
    const totalToDraw = Math.floor(animatedCharCount);

    for (let i = 0; i < totalToDraw; i++) {
        const cp = charPositions[i];
        if (!cp) continue;

        // Seeded PRNG for stable transformations
        const seedStr = `${bookId}_${pageNumber}_char_${i}_${cp.char}`;
        const prng = getPRNG(seedStr);

        // Calculate jitters
        const rotJitter = (prng() - 0.5) * jitter.rotation * (Math.PI / 180);
        const wobbleX = (prng() - 0.5) * jitter.wobble;
        const wobbleY = (prng() - 0.5) * jitter.wobble;
        const scaleJitter = 1.0 + (prng() - 0.5) * jitter.scale;

        ctx.save();
        
        // Translate to letter position + wobble
        ctx.translate(cp.x + wobbleX, cp.y + wobbleY);
        // Rotate
        ctx.rotate(rotJitter);
        // Scale size slightly
        ctx.scale(scaleJitter, scaleJitter);
        
        // Render character
        ctx.fillText(cp.char, 0, 0);
        
        ctx.restore();
    }

    // 5. Draw Blinking Writing Cursor
    if (isAnimating && totalToDraw > 0 && totalToDraw < charPositions.length) {
        const lastChar = charPositions[totalToDraw - 1];
        if (lastChar) {
            ctx.fillStyle = "rgba(29, 61, 132, 0.7)";
            ctx.beginPath();
            // Tiny circular ink drop as writing cursor
            ctx.arc(lastChar.x + 8, lastChar.y - 2, 1.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
