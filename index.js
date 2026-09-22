import fs from 'node:fs/promises';
import { marked } from 'marked';

/**
 * Property names of child tokens.
 */
const childItemNames = [
    'tokens',
    'items',
    'rows',
    'header'
];

export class MarkdownContextualChunker {

    /**
     * Constructor.
     * @param {String} sourceFile Source Markdown file.
     * @param {int} chunkMaxSize Max size of chunks.
     * @param {Function} lengthFunction The function that returns the token length for a piece of text.
     */
    constructor(sourceFile, chunkMaxSize, lengthFunction) {
        this.sourceFile = sourceFile;
        this.headerStack = [];
        this.headerChanged = false;
        this.lengthFunction = lengthFunction ?? this._lengthFunction;
        this.chunks = [];
        this.currentChunk = null;
        this.chunkMaxSize = chunkMaxSize;
        this.childTokensToIgnore = new Map();
    }

    /**
     * Execute the chunk and write the output file.
     */
    async chunk(targetFile) {
        const markdownText = await fs.readFile(this.sourceFile, { encoding: 'utf8' });
        const boundedWalkTokens = this._walkTokens.bind(this);
        marked.parse(markdownText, { walkTokens: boundedWalkTokens });

        // Add last chunk
        if (this.currentChunk.text.join("").trim() !== '') {
            const fullHeaderInfo = this._getCurrentChunkFullHeaderInfo();
            this._addCurrentChunk(fullHeaderInfo.header, fullHeaderInfo.tokenSize);
        }
        await fs.writeFile(targetFile, JSON.stringify(this.chunks, null, 4), { encoding: 'utf8' });
    }

    /**
     * Adds the current chunk to the chunks list. When this is called, the currentChunk contains a list of texts, which are the raw texts of the tokens we process.
     * It may be that the last token makes the chunk too long. If this is the case, then split it to make it fit.
     * @param {String} fullHeader 
     * @param {int} fullHeaderTokenSize 
     */
    _addCurrentChunk(fullHeader, fullHeaderTokenSize) {
        if (this.currentChunk.size + fullHeaderTokenSize > this.chunkMaxSize) {
            // This chunk is too long. If it has more than one token text, remove the last one and use the previous ones and after that continue with the last one below.
            if (this.currentChunk.text.length > 1) {
                const previousTexts = this.currentChunk.text.slice(0, -1).join("");
                if (previousTexts.trim() !== '') {
                    const previousTextsTokenSize = this.lengthFunction(previousTexts);
                    this.chunks.push({
                        headers: [...this.currentChunk.headers],
                        text: fullHeader + previousTexts,
                        size: previousTextsTokenSize + fullHeaderTokenSize
                    });
                }
                this.currentChunk.text = [this.currentChunk.text[this.currentChunk.text.length - 1]];
                this.currentChunk.size = this.lengthFunction(this.currentChunk.text[0]);
            }

            // Now we can handle the last text
            const lines = this.currentChunk.text.join("").split("\n");
            let text = [];
            let tokenSize = null;
            for (const line of lines) {
                text.push(line);
                tokenSize = this.lengthFunction(text.join(""));
                if (fullHeaderTokenSize + tokenSize > this.chunkMaxSize) {
                    // So now we add it, even it is longer than allowed. We do this to keep sentences and paragraphs to each other.
                    // TODO: Maybe split it even further? Like a dot (.)? But how about other languages, like Japanese?
                    this.chunks.push({
                        headers: [...this.currentChunk.headers],
                        text: fullHeader + text.join(""),
                        size: tokenSize + fullHeaderTokenSize
                    });
                    text = [];
                }
            }
            if (text.join("").trim() !== '') {
                this.chunks.push({
                    headers: [...this.currentChunk.headers],
                    text: fullHeader + text.join(""),
                    size: tokenSize + fullHeaderTokenSize
                });
            }
        } else {
            this.chunks.push({
                headers: [...this.currentChunk.headers],
                text: fullHeader + this.currentChunk.text.join(""),
                size: this.currentChunk.size + fullHeaderTokenSize
            });
        }

    }

    _getCurrentChunkFullHeaderInfo() {
        const header = '#'.repeat(this.currentChunk.headers.length) + ' ' + this.currentChunk.headers.map((value) => value.text).join(" | ") + "\n";
        const tokenSize = this.lengthFunction(header);
        return { header, tokenSize };
    }

    /**
     * Default length function.
     * @param {String} text 
     * @returns {int} Length of text. By default number of characters. Called should override this with the preferred tokenizer to return number of tokens.
     */
    _lengthFunction(text) {
        // For example the caller can use the js-tiktoken package and use this to make the lengthFunction returns the number of tokens:
        // const enc = getEncoding("o200k_base");
        // return enc.encode(text).length;
        return text.length;
    }

    /**
     * Returns a new chunk object.
     * @returns {Object} Chunk object.
     */
    _newChunk() {
        this.headerChanged = false;
        return {
            headers: [...this.headerStack],
            text: [],
            size: 0
        };
    }

    /**
     * Recursive function that adds all child tokens of the current token to the childTokensToIgnore map.
     * @param {Token} token 
     */
    _getChildTokensToIgnore(token) {
        for (const propertyName of childItemNames) {
            if (token[propertyName] && token[propertyName].length) {
                for (const childToken of token[propertyName]) {
                    this.childTokensToIgnore.set(childToken, true);
                    this._getChildTokensToIgnore(childToken);
                }
            }
        }

    }

    /**
     * Function that is called by Marked for each token. Child tokens are called first before proceeding to the next sibling token.
     * This function is used to create the chunks.
     * @param {Token} token 
     */
    _walkTokens(token) {

        if (this.childTokensToIgnore.has(token)) {
            return;
        }

        this._getChildTokensToIgnore(token);

        switch (token.type) {
            case 'heading':
                this.headerChanged = true;
                // If the header is one link to an ID (#), then use only the text.
                if (token.tokens && token.tokens.length === 1 && token.tokens[0].type === 'link' && token.tokens[0].href.startsWith('#')) {
                    token.text = token.tokens[0].text;
                }
                const tmp = [...this.headerStack];
                this.headerStack = [];
                for (const value of tmp) {
                    if (value.depth < token.depth) {
                        this.headerStack.push(value);
                    } else {
                        break;
                    }
                }
                this.headerStack.push({
                    depth: token.depth,
                    text: token.text
                });
                // We only use headings for setting up the current headerStack, so return here.
                return;
            case 'table':
                // We change a table to a list, where each list item consist of headername1=colvalue1;headername2=colvalue2 etc.
                // This way tables can be chunked without losing information.
                const rows = [];
                for (const row of token.rows) {
                    const cols = [];
                    for (let i = 0; i < row.length; i++) {
                        cols.push(`${token.header[i].text} = ${row[i].text}`);
                    }
                    rows.push(`- ${cols.join('; ')}`);
                }
                token.raw = rows.join("\n");
                token.type = 'list';
                delete token.rows;
                delete token.header;
                token.items = [];
                break;
        }

        const content = token.raw;
        const tokenSize = this.lengthFunction(content);

        if (this.currentChunk === null) {
            this.currentChunk = this._newChunk();
        }

        const fullHeaderInfo = this._getCurrentChunkFullHeaderInfo();

        if (this.headerChanged) {
            if (this.currentChunk.text.join("").trim() !== '') {
                this._addCurrentChunk(fullHeaderInfo.header, fullHeaderInfo.tokenSize);
            }
            this.currentChunk = this._newChunk();
        } else {
            if (this.currentChunk.size + tokenSize + fullHeaderInfo.tokenSize > this.chunkMaxSize) {
                this._addCurrentChunk(fullHeaderInfo.header, fullHeaderInfo.tokenSize);
                this.currentChunk = this._newChunk();
            }
        }
        this.currentChunk.text.push(content);
        this.currentChunk.size += tokenSize;
    };
}
