"use strict";

const assert = require('assert/strict');
const chalk = require('chalk');

const {renderLintCode} = require('./../../../lib');

const IGNORED_RETURN_TYPES = ['triggercondition', 'triggeraction', 'event'];

module.exports = {
	handlers: {
		prefer_constant_variable(eventName, node, fileName, funcName, variableName, variableType) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Global variable %s of type %s is never reassigned. Prefer declaration with 'constant %s'.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), variableName, variableType, variableType);
		},
		prefer_constant_function(eventName, node, fileName, funcName, variableName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s only calls 'constant' functions. Prefer 'constant function' declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), variableName);
		},
	},
};
