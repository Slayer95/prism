"use strict";

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const Parser = require('tree-sitter');
const JASS = require('tree-sitter-jass');

function resolveFromCWD(p) {
	return path.resolve(process.cwd(), p);
}

class JassParser {
	static parse(sourceCode) {
		const parser = new Parser();
		parser.setLanguage(JASS);
		const tree = parser.parse(sourceCode);
		if (tree.rootNode.hasError) return null;
		return tree;
	}

	static parseFile(filePath) {
		const fileContents = fs.readFileSync(resolveFromCWD(filePath), 'utf8');
		const parser = new Parser();
		parser.setLanguage(JASS);
		const tree = parser.parse(fileContents);
		if (tree.rootNode.hasError) return null;
		return tree;
	}

	static parseFiles(filePaths) {
		const fileContents = new Map(filePaths.map(p => [p, fs.readFileSync(resolveFromCWD(p), 'utf8')]));
		const output = [];
		const parser = new Parser();
		parser.setLanguage(JASS);
		for (const [filePath, fileContent] of fileContents) {
			const tree = parser.parse(fileContent);
			if (tree.rootNode.hasError) return null;
			output.push([filePath, tree]);
		}
		return new Map(output);
	}
}

module.exports = JassParser;
