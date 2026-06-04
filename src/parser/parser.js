"use strict";

const fs = require('fs');
const path = require('path');

const Parser = require('tree-sitter');
const JASS = require('tree-sitter-jass');

class JassParser {
	static parseFiles(filePaths) {
		const fileContents = new Map(filePaths.map(p => [p, fs.readFileSync(path.resolve(process.cwd(), p), 'utf8')]));
		const output = [];
		const parser = new Parser();
		parser.setLanguage(JASS);
		for (const [filePath, fileContent] of fileContents) {
			const tree = parser.parse(fileContent);
			output.push([filePath, {cst: tree, source: fileContent}]);
		}
		return new Map(output);
	}
}

module.exports = JassParser;
