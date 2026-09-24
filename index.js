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

    #headerStack;
    #headerChanged;
    #chunks;
    #currentChunk;
    #childTokensToIgnore;
    #options;

    /**
     * Instantiate a new MarkdownContextualChunker instance.
     * @param {Object} options Options to use for this instance.
     */
    constructor(options) {
        this.#options = this.#getOptions(options);
        this.#headerStack = [];
        this.#headerChanged = false;
        this.#chunks = [];
        this.#currentChunk = null;
        this.#childTokensToIgnore = new Map();
    }

    /**
     * Returns a complete options object.
     * @param {Object} options Options by caller.
     * @returns Object New options object.
     */
    #getOptions(options) {
        return {
            lengthFunction: options.lengthFunction ?? this.#characterlengthFunction,
            chunkMaxSize: options.chunkMaxSize ?? 512,
            sourceString: options.sourceString,
            tableAsList: options.tableAsList ?? false
        };
    }

    /**
     * Execute the chunk and returns them.
     * @returns Array of chunks
     */
    async chunk() {
        let boundedWalkTokens = this.#walkTokens.bind(this);
        marked.parse(this.#options.sourceString, { walkTokens: boundedWalkTokens });

        // Add last chunk
        const fullHeaderInfo = this.#getCurrentChunkFullHeaderInfo();
        this.#addCurrentChunk(fullHeaderInfo.header, fullHeaderInfo.tokenSize);

        boundedWalkTokens = null;

        return this.#chunks;
    }

    /**
     * Adds the current chunk to the chunks list. When this is called, the currentChunk contains a list of texts, which are the raw texts of the tokens we process.
     * It may be that the last token makes the chunk too long. If this is the case, then split it to make it fit.
     * @param {String} fullHeader The full header hierarchy as a string.
     * @param {int} fullHeaderTokenSize The size of the full header.
     */
    #addCurrentChunk(fullHeader, fullHeaderTokenSize) {
        if (!this.#currentChunk.hasContent) {
            return;
        }
        if (this.#currentChunk.size + fullHeaderTokenSize > this.#options.chunkMaxSize) {
            // This chunk is too long. If it has more than one token text, use all except the last one (because the last one made it too long) and continue below with the last one.
            if (this.#currentChunk.text.length > 1) {
                const previousTexts = this.#currentChunk.text.slice(0, -1).join("");
                if (previousTexts.trim() !== '') {
                    const previousTextsTokenSize = this.#options.lengthFunction(previousTexts);
                    this.#chunks.push({
                        headers: [...this.#currentChunk.headers],
                        text: fullHeader + previousTexts,
                        size: previousTextsTokenSize + fullHeaderTokenSize
                    });
                }
                this.#currentChunk.text = [this.#currentChunk.text[this.#currentChunk.text.length - 1]];
                this.#currentChunk.size = this.#options.lengthFunction(this.#currentChunk.text[0]);
            }

            // Now we can handle the last token text. Because this one is too long to fit, we split it across newlines.
            const lines = this.#currentChunk.text.join("").split("\n");
            let text = [];
            let tokenSize = null;
            let textString = null;
            for (const line of lines) {
                text.push(line);
                textString = text.join("\n");
                tokenSize = this.#options.lengthFunction(textString);
                if (fullHeaderTokenSize + tokenSize > this.#options.chunkMaxSize) {
                    // So now we add it, even it is longer than allowed. We do this to keep sentences and paragraphs to each other.
                    // TODO: Maybe split it even further? Like a dot (.)? But how about other languages?
                    this.#chunks.push({
                        headers: [...this.#currentChunk.headers],
                        text: fullHeader + textString,
                        size: tokenSize + fullHeaderTokenSize
                    });
                    text = [];
                    textString = null;
                }
            }
            if (textString) {
                this.#chunks.push({
                    headers: [...this.#currentChunk.headers],
                    text: fullHeader + textString,
                    size: tokenSize + fullHeaderTokenSize
                });
            }
        } else {
            this.#chunks.push({
                headers: [...this.#currentChunk.headers],
                text: fullHeader + this.#currentChunk.text.join(""),
                size: this.#currentChunk.size + fullHeaderTokenSize
            });
        }

    }

    /**
     * Returns the full header and the size of it.
     * @returns {Object} Header object with full header and size.
     */
    #getCurrentChunkFullHeaderInfo() {
        const header = '#'.repeat(this.#currentChunk.headers.length) + ' ' + this.#currentChunk.headers.map((value) => value.text).join(" | ") + "\n";
        const tokenSize = this.#options.lengthFunction(header);
        return { header, tokenSize };
    }

    /**
     * Default length function. If no length function is given, it uses character length.
     * @param {String} text The text to get the length of.
     * @returns {int} Length of text. By default number of characters. Called should override this with the preferred tokenizer to return number of tokens.
     */
    #characterlengthFunction(text) {
        // For example the caller can use the js-tiktoken package and use this to make the #options.lengthFunction returns the number of tokens:
        // const enc = getEncoding("o200k_base");
        // return enc.encode(text).length;
        return text.length;
    }

    /**
     * Returns a new chunk object.
     * @returns {Object} Chunk object.
     */
    #newChunk() {
        this.#headerChanged = false;
        return {
            headers: [...this.#headerStack],
            text: [],
            size: 0,
            hasContent: false
        };
    }

    /**
     * Recursive function that adds all child tokens of the current token to the #childTokensToIgnore map.
     * @param {Token} token The token to get the child tokens from.
     */
    #getChildTokensToIgnore(token) {
        for (const propertyName of childItemNames) {
            if (token[propertyName] && token[propertyName].length) {
                for (const childToken of token[propertyName]) {
                    this.#childTokensToIgnore.set(childToken, true);
                    this.#getChildTokensToIgnore(childToken);
                }
            }
        }

    }

    /**
     * Function that is called by Marked for each token. Child tokens are called first before proceeding to the next sibling token.
     * This function is used to create the chunks.
     * @param {Token} token The token to walk.
     */
    #walkTokens(token) {

        if (this.#childTokensToIgnore.has(token)) {
            return;
        }

        this.#getChildTokensToIgnore(token);

        switch (token.type) {
            case 'heading':
                this.#headerChanged = true;
                // If the header is one link to an ID (#), then use only the text.
                if (token.tokens && token.tokens.length === 1 && token.tokens[0].type === 'link' && token.tokens[0].href.startsWith('#')) {
                    token.text = token.tokens[0].text;
                }
                const tmp = [...this.#headerStack];
                this.#headerStack = [];
                for (const value of tmp) {
                    if (value.depth < token.depth) {
                        this.#headerStack.push(value);
                    } else {
                        break;
                    }
                }
                this.#headerStack.push({
                    depth: token.depth,
                    text: token.text
                });
                // We only use headings for setting up the current #headerStack, so return here.
                return;
            case 'table':
                if (this.#options.tableAsList) {
                    // We change a table to a list, where each list item consist of headername1=colvalue1;headername2=colvalue2 etc.
                    // This way tables can be chunked without losing information.
                    // But this only works for relatively simple tables that have one header.
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
                }
                break;
        }

        const content = token.raw;
        const tokenSize = this.#options.lengthFunction(content);

        if (this.#currentChunk === null) {
            this.#currentChunk = this.#newChunk();
        }

        const fullHeaderInfo = this.#getCurrentChunkFullHeaderInfo();

        if (this.#headerChanged) {
            this.#addCurrentChunk(fullHeaderInfo.header, fullHeaderInfo.tokenSize);
            this.#currentChunk = this.#newChunk();
        } else {
            if (this.#currentChunk.size + tokenSize + fullHeaderInfo.tokenSize > this.#options.chunkMaxSize) {
                this.#addCurrentChunk(fullHeaderInfo.header, fullHeaderInfo.tokenSize);
                this.#currentChunk = this.#newChunk();
            }
        }
        this.#currentChunk.text.push(content);
        this.#currentChunk.size += tokenSize;
        if (content.trim() !== '') {
            this.#currentChunk.hasContent = true;
        }
    };
}
