import { MarkdownContextualChunker } from './index.js';
import { getEncoding } from "js-tiktoken";

const enc = getEncoding("o200k_base");

function lengthFunction(text) {
    return enc.encode(text).length;
}

const chunker = new MarkdownContextualChunker('./file5.md', 512, lengthFunction);
await chunker.chunk('./file5.md.json');