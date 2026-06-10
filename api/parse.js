"use strict";

const util = require('util');
const chalk = require('chalk');

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
	dump: {
		type: 'boolean',
		multiple: false,
		short: 'd',
		default: false,
	},
	library: {
		type: 'string',
		multiple: true,
		short: 'l',
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
	const {error, trees} = JASSParser.parseFiles([...library ?? [], ...positionals]);
	for (const [filePath, tree] of trees) {
		if (values.quiet) continue;
		if (!values.dump) continue;
		console.log(`# Tree for ${filePath}`);
		console.log(tree.rootNode.toString());
		console.log(``);
	}

	if (error) {
		process.exitCode = 1;
	}

	if (!values.quiet) {
		if (error) {
			console.error(chalk.red(`not ok`));
		} else {
			console.log(chalk.green(`ok`));
		}
	}
}

main();
