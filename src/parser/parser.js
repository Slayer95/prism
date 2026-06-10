"use strict";

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const Parser = require('tree-sitter');
const JASS = require('tree-sitter-jass');

function resolveFromCWD(p) {
	return path.resolve(process.cwd(), p);
}

class ParseError extends SyntaxError {
	constructor(message, extraData = null) {
		super(message);
		this.name = "ParseError";
		this.extraData = extraData;
	}
}

class JassParser {
	static parse(sourceCode) {
		const parser = new Parser();
		parser.setLanguage(JASS);
		const tree = parser.parse(sourceCode);
		return {
			error: tree.rootNode.hasError ? new ParseError(`Error parsing source code`) : null,
			tree,
		};
	}

	static parseFile(filePath) {
		const fileContents = fs.readFileSync(resolveFromCWD(filePath), 'latin1');
		const parser = new Parser();
		parser.setLanguage(JASS);
		const tree = parser.parse(fileContents);
		return {
			error: tree.rootNode.hasError ? new ParseError(`Error parsing file ${filePath}`) : null,
			tree,
		};
	}

	static parseFiles(filePaths) {
		const fileContents = new Map(filePaths.map(p => [p, fs.readFileSync(resolveFromCWD(p), 'latin1')]));
		const output = [];
		const parser = new Parser();
		let anyError = false;
		let errorFile = '';
		parser.setLanguage(JASS);
		for (const [filePath, fileContent] of fileContents) {
			const tree = parser.parse(fileContent);
			if (tree.rootNode.hasError) {
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
