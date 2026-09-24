import fs from 'node:fs/promises';
import { MarkdownContextualChunker } from '../src/index.js';
import { getEncoding } from "js-tiktoken";
// Testing the package: first `npm pack` and than use this to import the test package
//import { MarkdownContextualChunker } from '@michielvaneerd/markdown-contextual-chunker';

const enc = getEncoding("o200k_base");

function lengthFunction(text) {
    return enc.encode(text).length;
}

const markdownText = await fs.readFile('./file-private-1.md', { encoding: 'utf8' });

const chunker = new MarkdownContextualChunker({
    sourceString: markdownText,
    chunkMaxSize: 512,
    lengthFunction: lengthFunction,
    tableAsList: true
});
const chunks = await chunker.chunk();
await fs.writeFile('./file-private-1.md.json', JSON.stringify(chunks, null, 4), { encoding: 'utf8' });