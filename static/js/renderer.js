import { getPRNG } from "./utils.js?v=6.0";

const VIRTUAL_WIDTH = 800;
const VIRTUAL_HEIGHT = 1000;

let canvas = null;
let ctx = null;

// Layout config
const config = {
    topMargin: 75, // 2cm top margin gap
    bottomMargin: 50,
    leftMargin: 30,
    rightMargin: 770,
    lineSpacing: 22,
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
let lastOverflowIndex = -1;
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
export function setRenderOptions({ font, fontSize, jitterLevel, activeBookId, activePageNumber, inkColor }) {
    if (font !== undefined) currentFont = font;
    if (fontSize !== undefined) currentFontSize = fontSize;
    if (jitterLevel !== undefined) currentJitterLevel = jitterLevel;
    if (activeBookId !== undefined) bookId = activeBookId;
    if (activePageNumber !== undefined) pageNumber = activePageNumber;
    if (inkColor !== undefined) {
        if (pageText && !pageText.includes("[color:")) {
            pageText = `[color:${config.inkColor}]${pageText}[/color]`;
        }
        config.inkColor = inkColor;
    }
    
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
    if (text && !text.includes("[color:")) {
        pageText = `[color:${config.inkColor}]${text}[/color]`;
    } else {
        pageText = text || "";
    }
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
    
    // Tag newly appended text with active ink color
    const colorTag = `[color:${config.inkColor}]${newText}[/color]`;
    
    const separator = pageText.length > 0 && !pageText.endsWith(" ") ? " " : "";
    pageText = pageText + separator + colorTag;
    
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
 * Parses color tags formatted as [color:#hex]text[/color] into structured segments.
 */
function parseColorTokens(rawText) {
    if (!rawText) return [];
    
    const regex = /\[color:(#[0-9a-fA-F]{6})\]([\s\S]*?)\[\/color\]/g;
    const tokens = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(rawText)) !== null) {
        if (match.index > lastIndex) {
            const plain = rawText.substring(lastIndex, match.index);
            if (plain) tokens.push({ text: plain, color: config.inkColor, rawStartIndex: lastIndex });
        }
        tokens.push({ text: match[2], color: match[1], rawStartIndex: match.index });
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < rawText.length) {
        const plain = rawText.substring(lastIndex);
        if (plain) tokens.push({ text: plain, color: config.inkColor, rawStartIndex: lastIndex });
    }

    return tokens;
}

/**
 * Recalculates exact character placements on the page based on text-wrapping.
 */
function recalculateLayout() {
    if (!ctx) return;

    ctx.font = `${currentFontSize}px "${currentFont}"`;
    
    // Layout matching single page screenshot:
    // Red margin line at 100px. Text starts at 112px. Safe right margin wrap limit at 720px.
    const leftMargin = 100;
    const rightMargin = 720;
    const startX = leftMargin + 12; // 112px text starting position right of red margin line
    
    const maxLines = Math.floor((VIRTUAL_HEIGHT - config.topMargin - config.bottomMargin) / config.lineSpacing);
    const layout = [];
    let lineIndex = 0;
    let cursorX = startX;
    
    let isFull = false;
    let overflowIndex = -1;

    // Parse tokens with individual color metadata
    const tokens = parseColorTokens(pageText);
    
    // Break parsed tokens into words while retaining color metadata
    const wordsWithColor = [];
    for (const token of tokens) {
        const parts = token.text.split(/(\s+)/);
        let currentOffset = token.rawStartIndex;
        
        for (const part of parts) {
            if (part !== "") {
                wordsWithColor.push({
                    word: part,
                    color: token.color,
                    rawIndex: currentOffset
                });
            }
            currentOffset += part.length;
        }
    }

    let textProcessedLength = 0;

    for (let w = 0; w < wordsWithColor.length; w++) {
        const item = wordsWithColor[w];
        const word = item.word;
        const color = item.color;
        if (word === "") continue;

        // Check if word contains explicit newline
        if (word.includes('\n')) {
            const newlines = word.split('\n').length - 1;
            lineIndex += newlines;
            cursorX = startX;
            
            if (lineIndex >= maxLines) {
                isFull = true;
                overflowIndex = item.rawIndex !== undefined ? item.rawIndex : textProcessedLength;
                break;
            }
            textProcessedLength += word.length;
            continue;
        }

        const isWhitespace = /^\s+$/.test(word);

        // Measure word width including glyph overhang and character jitter safety padding
        let wordWidth = 0;
        for (let i = 0; i < word.length; i++) {
            const ch = word[i];
            const chW = ch === " " ? Math.max(ctx.measureText(ch).width, currentFontSize * 0.32) : ctx.measureText(ch).width;
            wordWidth += chW;
        }
        const safetyPadding = isWhitespace ? 0 : (word.length * 2.5 + 4.0);
        const totalWordWidth = wordWidth + safetyPadding;

        // Measure before drawing: Check if word overflows right margin (720px)
        if (!isWhitespace && (cursorX + totalWordWidth > rightMargin)) {
            if (cursorX > startX) {
                cursorX = startX;
                lineIndex++;
            }
        } else if (isWhitespace && (cursorX + wordWidth > rightMargin)) {
            cursorX = startX;
            lineIndex++;
            textProcessedLength += word.length;
            continue;
        }

        // Check if page vertical capacity is exceeded
        if (lineIndex >= maxLines) {
            isFull = true;
            overflowIndex = item.rawIndex !== undefined ? item.rawIndex : textProcessedLength;
            break;
        }

        // Ignore leading whitespace at the start of a line
        if (isWhitespace && cursorX === startX) {
            textProcessedLength += word.length;
            continue;
        }

        // Calculate positions for characters in this word
        let wordX = cursorX;

        const seedStr = `${bookId}_${pageNumber}_word_${w}`;
        const prng = getPRNG(seedStr);
        const jitter = jitterSettings[currentJitterLevel];

        for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charWidth = char === " " ? Math.max(ctx.measureText(char).width, currentFontSize * 0.32) : ctx.measureText(char).width;
            
            // Character-level safety fallback: if single character exceeds right margin, wrap line
            if (wordX + charWidth > rightMargin && wordX > startX) {
                lineIndex++;
                if (lineIndex >= maxLines) {
                    isFull = true;
                    overflowIndex = item.rawIndex !== undefined ? (item.rawIndex + c) : (textProcessedLength + c);
                    break;
                }
                wordX = startX;
            }

            layout.push({
                char: char,
                x: wordX,
                y: config.topMargin + lineIndex * config.lineSpacing + (config.lineSpacing * 0.72),
                lineIndex: lineIndex,
                wordIndex: w,
                charIndex: c,
                color: color
            });

            const spacingJitter = (prng() - 0.5) * jitter.spacing;
            wordX += charWidth + spacingJitter;
        }

        if (isFull) break;

        cursorX = wordX;
        textProcessedLength += word.length;
    }

    charPositions = layout;

    if (isFull && overflowIndex !== -1) {
        overflowText = pageText.substring(overflowIndex).trim();
        lastOverflowIndex = overflowIndex;
    } else {
        overflowText = "";
        lastOverflowIndex = -1;
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
        if (lastOverflowIndex !== -1 && lastOverflowIndex < pageText.length) {
            pageText = pageText.substring(0, lastOverflowIndex).trim();
            recalculateLayout();
            drawPage();
        }
        overflowText = "";
        lastOverflowIndex = -1;
        
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
    
    const maxLines = 40;
    for (let i = 0; i < maxLines; i++) {
        const y = config.topMargin + i * config.lineSpacing;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(VIRTUAL_WIDTH, y);
        ctx.stroke();
    }

    // 2. Draw Left Margin Line
    const marginX = 100;
    ctx.strokeStyle = "rgba(225, 80, 80, 0.75)"; // Soft margin red line
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(marginX, 0);
    ctx.lineTo(marginX, VIRTUAL_HEIGHT);
    ctx.stroke();

    // 3. Draw Header Lines/Boxes (Page & Date indicators in top-right header space)
    ctx.fillStyle = "#fdf6e6"; // Solid paper color mask
    ctx.fillRect(VIRTUAL_WIDTH - 200, 20, 185, 24);
    
    ctx.strokeStyle = "rgba(166, 196, 240, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(VIRTUAL_WIDTH - 200, 20, 185, 24);
    
    ctx.font = "10px 'Inter', sans-serif";
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillText(`PAGE: ${pageNumber}   DATE: ___/___/___`, VIRTUAL_WIDTH - 192, 36);

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
        ctx.fillStyle = cp.color || config.inkColor;
        
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

/**
 * Renders a static, non-animating page onto a canvas.
 * Useful for displaying side-by-side pages in a double page spread.
 */
export function renderPageStatic(canvasElement, text, pageNum, options = {}) {
    if (!canvasElement) return;
    
    // Scale canvas backing store for High-DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvasElement.width = VIRTUAL_WIDTH * dpr;
    canvasElement.height = VIRTUAL_HEIGHT * dpr;
    
    const staticCtx = canvasElement.getContext('2d');
    staticCtx.scale(dpr, dpr);
    
    const font = options.font || currentFont;
    const fontSize = options.fontSize || currentFontSize;
    const jitterLevel = options.jitterLevel !== undefined ? options.jitterLevel : currentJitterLevel;
    
    const leftMargin = 100;
    const rightMargin = 720;
    const startX = leftMargin + 12; // 112px text starting position right of red margin line
    
    // 1. Draw Ruled Lines
    staticCtx.strokeStyle = "rgba(166, 196, 240, 0.45)";
    staticCtx.lineWidth = 1;
    
    const maxLines = 40;
    for (let i = 0; i < maxLines; i++) {
        const y = config.topMargin + i * config.lineSpacing;
        staticCtx.beginPath();
        staticCtx.moveTo(0, y);
        staticCtx.lineTo(VIRTUAL_WIDTH, y);
        staticCtx.stroke();
    }

    // 2. Draw Left Margin Line
    staticCtx.strokeStyle = "rgba(225, 80, 80, 0.75)"; // Soft margin red line
    staticCtx.lineWidth = 1.2;
    staticCtx.beginPath();
    staticCtx.moveTo(leftMargin, 0);
    staticCtx.lineTo(leftMargin, VIRTUAL_HEIGHT);
    staticCtx.stroke();

    // 3. Draw Header Box (in top header space above ruled lines)
    staticCtx.fillStyle = "#fdf6e6"; // Solid paper color mask
    staticCtx.fillRect(VIRTUAL_WIDTH - 200, 20, 185, 24);
    
    staticCtx.strokeStyle = "rgba(166, 196, 240, 0.55)";
    staticCtx.lineWidth = 1;
    staticCtx.strokeRect(VIRTUAL_WIDTH - 200, 20, 185, 24);
    
    staticCtx.font = "10px 'Inter', sans-serif";
    staticCtx.fillStyle = "rgba(0, 0, 0, 0.5)";
    staticCtx.fillText(`PAGE: ${pageNum}   DATE: ___/___/___`, VIRTUAL_WIDTH - 192, 36);
    
    if (!text) return;
    
    staticCtx.font = `${fontSize}px "${font}"`;
    staticCtx.fillStyle = config.inkColor;
    staticCtx.textBaseline = "alphabetic";
    
    const tokens = parseColorTokens(text);
    const wordsWithColor = [];
    for (const token of tokens) {
        const parts = token.text.split(/(\s+)/);
        let currentOffset = token.rawStartIndex;
        for (const part of parts) {
            if (part !== "") {
                wordsWithColor.push({
                    word: part,
                    color: token.color,
                    rawIndex: currentOffset
                });
            }
            currentOffset += part.length;
        }
    }

    let lineIndex = 0;
    let cursorX = startX;
    const jitter = jitterSettings[jitterLevel];
    let textProcessedLength = 0;

    for (let w = 0; w < wordsWithColor.length; w++) {
        const item = wordsWithColor[w];
        const word = item.word;
        const color = item.color;
        if (word === "") continue;

        if (word.includes('\n')) {
            const newlines = word.split('\n').length - 1;
            lineIndex += newlines;
            cursorX = startX;
            if (lineIndex >= maxLines) break;
            textProcessedLength += word.length;
            continue;
        }

        const isWhitespace = /^\s+$/.test(word);

        let wordWidth = 0;
        for (let i = 0; i < word.length; i++) {
            const ch = word[i];
            const chW = ch === " " ? Math.max(staticCtx.measureText(ch).width, fontSize * 0.32) : staticCtx.measureText(ch).width;
            wordWidth += chW;
        }
        const safetyPadding = isWhitespace ? 0 : (word.length * 2.5 + 4.0);
        const totalWordWidth = wordWidth + safetyPadding;

        if (!isWhitespace && (cursorX + totalWordWidth > rightMargin)) {
            if (cursorX > startX) {
                cursorX = startX;
                lineIndex++;
            }
        } else if (isWhitespace && (cursorX + wordWidth > rightMargin)) {
            cursorX = startX;
            lineIndex++;
            textProcessedLength += word.length;
            continue;
        }

        if (lineIndex >= maxLines) break;

        if (isWhitespace && cursorX === startX) {
            textProcessedLength += word.length;
            continue;
        }

        let wordX = cursorX;
        const seedStr = `${bookId}_${pageNum}_word_${w}`;
        const prng = getPRNG(seedStr);

        for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charWidth = char === " " ? Math.max(staticCtx.measureText(char).width, fontSize * 0.32) : staticCtx.measureText(char).width;
            
            if (wordX + charWidth > rightMargin && wordX > startX) {
                lineIndex++;
                if (lineIndex >= maxLines) break;
                wordX = startX;
            }

            const lineY = config.topMargin + lineIndex * config.lineSpacing + (config.lineSpacing * 0.72);
            
            const seedCharStr = `${bookId}_${pageNum}_char_${textProcessedLength + c}_${char}`;
            const prngChar = getPRNG(seedCharStr);
            
            const rotJitter = (prngChar() - 0.5) * jitter.rotation * (Math.PI / 180);
            const wobbleX = (prngChar() - 0.5) * jitter.wobble;
            const wobbleY = (prngChar() - 0.5) * jitter.wobble;
            const scaleJitter = 1.0 + (prngChar() - 0.5) * jitter.scale;
            
            staticCtx.save();
            staticCtx.fillStyle = color || config.inkColor;
            staticCtx.translate(wordX + wobbleX, lineY + wobbleY);
            staticCtx.rotate(rotJitter);
            staticCtx.scale(scaleJitter, scaleJitter);
            staticCtx.fillText(char, 0, 0);
            staticCtx.restore();

            const spacingJitter = (prng() - 0.5) * jitter.spacing;
            wordX += charWidth + spacingJitter;
        }
        cursorX = wordX;
        textProcessedLength += word.length;
    }
}
