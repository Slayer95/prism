"use strict";

const tsNodeOptions = {}

require('ts-node').register(tsNodeOptions);

const fs = require('fs');
const path = require('path');
const util = require('util');

const Validator = require('./../src/validator/validator');
const JASSParser = require('./../src/parser/parser');

const cliOptions = {
	spec: {
		type: 'string',
		multiple: false,
		short: 'S',
		default: 'jass2',
	},
	w3version: {
		type: 'string',
		multiple: false,
		short: 'w',
		default: '1.24',
	},
	quiet: {
		type: 'boolean',
		multiple: false,
		short: 'q',
		default: false,
	},
	rule: {
		type: 'string',
		multiple: true,
		short: 'r',
	},
};

const cliConfig = {
	options: cliOptions,
	strict: true,
	allowPositionals: true,
	tokens: false,
};

function main() {
	const {values, positionals} = util.parseArgs(cliConfig);
	const parsedTrees = JASSParser.parseFiles(positionals);
	const validator = new Validator(values);
	validator.checkTrees(parsedTrees);
	console.log(`Parsed a total of ${validator.nodeCount} nodes.`);
}

main();
