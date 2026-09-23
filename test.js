import { MarkdownContextualChunker } from './index.js';
import { getEncoding } from "js-tiktoken";

const enc = getEncoding("o200k_base");

function lengthFunction(text) {
    return enc.encode(text).length;
}

const chunker = new MarkdownContextualChunker('./file2.md', 400);
await chunker.chunk('./file2.md.json');