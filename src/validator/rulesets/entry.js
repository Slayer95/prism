"use strict";

//const assert = require('assert/strict');
const chalk = require('chalk');

const {renderLintCode} = require('./../../../lib');

module.exports = {
	handlers: {
		entrypoint_constant(node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %%s Entrypoint '%s' cannot be a constant function.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), symbolName);
		},
		entrypoint_missing(node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %%s Entrypoint '%s' is missing.\n`, '~', '~', '~', symbolName);
		},
		entrypoint_nonfunction(node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %%s Entrypoint '%s' should be a function.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), symbolName);
		},
		entrypoint_parameters(node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %%s Entrypoint '%s' should not take parameters.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), symbolName);
		},
		entrypoint_returns(node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %%s Entrypoint '%s' should return nothing.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), symbolName);
		},
		no_functions() {
			this.error(`%s:%s\n\n  %s\n\n  %%s No function declarations found.\n`, '~', '~', '~');
		},
		no_natives() {
			this.error(`%s:%s\n\n  %s\n\n  %%s No native declarations found.\n`, '~', '~', '~');
		},
	},
};
