"use strict";

const assert = require('assert');
const util = require('util');
const chalk = require('chalk');

const Validator = require('./../src/validator/validator');
const JASSParser = require('./../src/parser/parser');
const {ValidatorResult} = require('./../lib/constants');
const Formatter = require('./../src/formatter/formatter');

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
	// Files may be passed either to library or to positionals.
	// Files passed to 'library' won't be included in the output.
	library: {
		type: 'string',
		multiple: true,
		short: 'l',
	},
	output: {
		type: 'string',
		multiple: false,
		short: 'o',
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
	const {error, trees} = JASSParser.parseFiles([...values.library ?? [], ...positionals]);
	if (error) {
		console.error(error.stack);
		return;
	}

	const buffer = [];
	for (const userCodeFilePath of positionals) {
		const formatter = new Formatter(trees.get(userCodeFilePath), null, buffer);
		formatter.run();
	}

	assert(buffer.length < 100000);
	for (const line of buffer) {
		process.stdout.write(Buffer.from(line, 'latin1'));
	}
}

main();
