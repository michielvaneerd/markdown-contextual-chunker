import fs from 'node:fs/promises';
import { MarkdownContextualChunker } from './index.js';
import { getEncoding } from "js-tiktoken";

const enc = getEncoding("o200k_base");

function lengthFunction(text) {
    return enc.encode(text).length;
}

const markdownText = await fs.readFile('./file5.md', { encoding: 'utf8' });

const chunker = new MarkdownContextualChunker({
    sourceString: markdownText,
    chunkMaxSize: 512,
    lengthFunction: lengthFunction,
    tableAsList: true
});
const chunks = await chunker.chunk();
await fs.writeFile('./file5-list.md.json', JSON.stringify(chunks, null, 4), { encoding: 'utf8' });