"use strict";

//const assert = require('assert');
const fs = require('fs');
const path = require('path');

const Parser = require('tree-sitter');
const JASS = require('tree-sitter-jass');

const CHUNK_SIZE = 16768;
const parseOptions = {bufferSize: CHUNK_SIZE};

function resolveFromCWD(p) {
	return path.resolve(process.cwd(), p);
}

function doParseWhole(parser, buffer) {
	return parser.parse(offset => {
		if (offset < buffer.length) {
			return buffer.slice(offset, buffer.length);
		}
		return null;
	});
}

function doParseSyncStream(parser, buffer) {
	return parser.parse(offset => {
		if (offset < buffer.length) {
			return buffer.slice(offset, offset + CHUNK_SIZE);
		}
		return null;
	});
}

class ParseError extends SyntaxError {
	constructor(message, extraData = null) {
		super(message);
		this.name = "ParseError";
		this.extraData = extraData;
	}
}

class JassParser {
	static _parseString(input, desc) {
		const parser = new Parser();
		parser.setLanguage(JASS);
		const tree = parser.parse(input);
		return {
			error: tree.rootNode.hasError ? new ParseError(`Error parsing ${desc}`) : null,
			tree,
		};
	}

	static parseString(input, desc) {
		const parser = new Parser();
		parser.setLanguage(JASS);
		const tree = parser.parse(input, undefined, {bufferSize: 2 * Buffer.byteLength(input, 'latin1')});
		return {
			error: tree.rootNode.hasError ? new ParseError(`Error parsing ${desc}`) : null,
			tree,
		};
	}

	static parseWhole(buffer, desc) {
		const parser = new Parser();
		parser.setLanguage(JASS);
		const tree = doParseWhole(parser, buffer);
		return {
			error: tree.rootNode.hasError ? new ParseError(`Error parsing ${desc}`) : null,
			tree,
		};
	}

	static parseSyncStream(buffer, desc) {
		const parser = new Parser();
		parser.setLanguage(JASS);
		const tree = doParseSyncStream(parser, buffer);
		return {
			error: tree.rootNode.hasError ? new ParseError(`Error parsing ${desc}`) : null,
			tree,
		};
	}

	static parse(sourceCode) {
		if (Buffer.isBuffer(sourceCode) || sourceCode instanceof Uint8Array) {
			return JassParser.parseWhole(sourceCode, `source code`);
		}
		//return JassParser.parseWhole(Buffer.from(sourceCode, 'latin1'), `source code`);
		return JassParser.parseWhole(sourceCode, `source code`);
	}

	static parseFile(filePath) {
		const fileContents = fs.readFileSync(resolveFromCWD(filePath), 'latin1');
		return JassParser.parseWhole(fileContents, `file ${filePath}`);
	}

	static parseFiles(filePaths) {
		const fileContents = new Map(filePaths.map(p => [p, fs.readFileSync(resolveFromCWD(p), 'latin1')]));
		const output = [];
		const parser = new Parser();
		let anyError = false;
		let errorFile = '';
		parser.setLanguage(JASS);
		for (const [filePath, fileContent] of fileContents) {
			const tree = doParseSyncStream(parser, fileContent);
			if (!anyError && tree.rootNode.hasError) {
				anyError = true;
				errorFile = filePath;
			}
			output.push([filePath, tree]);
		}
		return {
			error: anyError ? new ParseError(`Error parsing file ${errorFile}`) : null,
			trees: new Map(output),
		};
	}
}

JassParser.ParseError = ParseError;

module.exports = JassParser;
