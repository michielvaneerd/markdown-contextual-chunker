# Markdown Contextual Chunker

Chunks Markdown text and adds the header hierarchy to every chunk to improve the retrieval quality in RAG usage.
It starts a new chunk when a new header appears or if the number of tokens is higher then allowed.

## Example Markdown and chunks

**The Markdown text below**

```markdown
# Header 1

Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.

## Header 2

Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.

## Header 3

Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.
```

**Can be chunked to**

```json
[
    {
        text: "# Header 1\nLorem ipsum..."
    },
    {
        text: "## Header | Header 2 1\nLorem ipsum..."
    },
    {
        text: "## Header | Header 3 1\nLorem ipsum..."
    },
]
```

## Usage

Note that we use a custom `lengthFunction` here that uses the `js-tiktoken` library. This is not required, but otherwise a default `lengthFunction` will be used that count the number of characters, which is usually not what you want.

```javascript
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
```