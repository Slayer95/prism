"use strict";

const fs = require('fs');
const path = require('path');
const util = require('util');
const chalk = require('chalk');

const Validator = require('./../src/validator/validator');
const JASSParser = require('./../src/parser/parser');
const {ValidatorResult} = require('./../lib/constants');

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
	const {result, errors, warnings} = validator.checkTrees(parsedTrees);
	switch (result) {
		case ValidatorResult.kOk:
			break;
		case ValidatorResult.kWarn:
			process.exitCode = 2;
			break;
		case ValidatorResult.kError:
			process.exitCode = 1;
			break;
	}
	for (const error of errors) {
		console.error(util.format(error, chalk.red('error')));
	}
	for (const warning of warnings) {
		//console.error(util.format(warning, chalk.yellow('warn')));
	}
	console.log(util.format(`%s Parsed a total of %d nodes.`, chalk.green('info'), validator.nodeCount));
}

main();
