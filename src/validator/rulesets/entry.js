"use strict";

//const assert = require('assert/strict');
const chalk = require('chalk');

const {renderLintCode} = require('./../../../lib');

module.exports = {
	handlers: {
		entrypoint_constant(eventName, node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Entrypoint '%s' cannot be a constant function.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`entry/${eventName}`),  symbolName);
		},
		entrypoint_missing(eventName, node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Entrypoint '%s' is missing.\n`, '~', '~', '~', chalk.cyan(`entry/${eventName}`), symbolName);
		},
		entrypoint_nonfunction(eventName, node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Entrypoint '%s' should be a function.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`entry/${eventName}`),  symbolName);
		},
		entrypoint_parameters(eventName, node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Entrypoint '%s' should not take parameters.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`entry/${eventName}`),  symbolName);
		},
		entrypoint_returns(eventName, node, fileName, ctx, symbolName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Entrypoint '%s' should return nothing.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`entry/${eventName}`),  symbolName);
		},
		no_functions(eventName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s No function declarations found.\n`, '~', '~', '~', chalk.cyan(`entry/${eventName}`));
		},
		no_natives(eventName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s No native declarations found.\n`, '~', '~', '~', chalk.cyan(`entry/${eventName}`));
		},
	},
};
