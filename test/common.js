"use strict";

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');

const Validator = require('./../src/validator/validator');
const JASSParser = require('./../src/parser/parser');
const {ValidatorResult} = require('./../lib/constants');

const WITH_FILE_TYPES = {withFileTypes: true};
const CORE_RULES = ['core'];

//function serialize(node) {
	//return node.toString();
	/*return {
		type: node.type,
		text: node.text,
		children: node.namedChildren.map(serialize) ?? []
	};*/
//}

/*
function ast(node) {
	return {
		type: node.type,
		children: node.namedChildren.map(ast)
	};
}
*/

function validate(sourceCode, rules = CORE_RULES) {
	throw new Error(sourceCode);
	const parsedTree = JASSParser.parse(sourceCode);
	if (!parsedTree) return null;
	const validator = new Validator({rule: rules});
	return validator.checkTree('~', parsedTree);
}

function validateFile(filePath, rules = CORE_RULES) {
	const parsedTree = JASSParser.parseFile(filePath);
	if (!parsedTree) return null;
	const validator = new Validator({rule: rules});
	return validator.checkTree(filePath, parsedTree);
}

function validateFiles(filePaths, rules = CORE_RULES) {
	const parsedTrees = JASSParser.parseFiles(filePaths);
	if (!parsedTrees) return null;
	const validator = new Validator({rule: rules});
	return validator.checkTrees(parsedTrees);
}

function* getFilesRecursive(rootFolder, extName) {
	for (const dirEntry of fs.readdirSync(rootFolder, WITH_FILE_TYPES)) {
		if (dirEntry.isSymbolicLink()) continue;
		if (dirEntry.isDirectory()) {
			yield* getFilesRecursive(path.resolve(rootFolder, dirEntry.name), extName);
		} else if (dirEntry.name.endsWith(extName)) {
			yield path.resolve(rootFolder, dirEntry.name);
		}
	}
}

function snapshot(namespace, name, what) {
    const snapshotPath = path.resolve(
        __dirname,
        "__snapshots__",
        `${namespace}_${Buffer.from(name).toString('hex')}.snap`
    );

    const serialized = typeof what === 'object' ? util.format(`Object (%j)`, what) : `${typeof what} (${what})`

    if (!fs.existsSync(snapshotPath)) {
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.writeFileSync(snapshotPath, serialized, "utf8");
        return;
    }

    const expected = fs.readFileSync(snapshotPath, "utf8");
    assert.strictEqual(serialized, expected);
}

module.exports = {
	//serialize,
	//ast,

	validate,
	validateFile,
	validateFiles,

	getFilesRecursive,
	snapshot,
};
