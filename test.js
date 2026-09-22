import { MarkdownContextualChunker } from './index.js';
import { getEncoding } from "js-tiktoken";

const enc = getEncoding("o200k_base");

function lengthFunction(text) {
    return enc.encode(text).length;
}

const chunker = new MarkdownContextualChunker('./owasp-cross-site-request-forgery-prevention-cheat-sheet.md', 256, lengthFunction);
await chunker.chunk('./owasp-cross-site-request-forgery-prevention-cheat-sheet.md.json');