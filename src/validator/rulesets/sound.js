"use strict";

const assert = require('assert/strict');
const chalk = require('chalk');
const util = require('util');

const {renderLintCode} = require('./../../../lib');

module.exports = {
	handlers: {
		api_too_early(node, fileName, funcName, apiName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s %s API cannot be used in a global declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), apiName));
		},

		array_access_off_bounds(node, fileName, funcName, arrayName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Invalid access to negative index of %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), arrayName));
		},

		call_bad_arity(node, fileName, funcName, lifeCycle, calleeName, parameterCount, argumentCount) {
			if (lifeCycle !== 'deferred') return;
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s expects %d arguments, but was called with %d.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName, parameterCount, argumentCount));
		},
		exitwhen_constant(node, fileName, funcName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Loop exit condition is constant across all iterations.`));
		},
		funarg_native(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Native function %s cannot be an argument for higher-order functions.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName));
		},
		funarg_not_nullary(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s accepts parameters, so it cannot an argument for higher-order functions.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName));
		},
		function_non_existent(node, fileName, funcName, lifeCycle, calleeName) {
			if (lifeCycle !== 'deferred') return;
			if (this.deferEvent(node, fileName, funcName, lifeCycle)) return;
			const definedNode = this.getSymbol(funcName)?.node;
			if (!definedNode) {
				this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s is not defined.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName));
			}
		},
		higher_order_type_mismatch(node, fileName, funcName, lowerExpectedReturnType, lowerActualReturnType, higherName, lowerName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s accepts functions that return '%s', but %s returns '%s'.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), higherName, lowerExpectedReturnType, lowerName, lowerActualReturnType));
		},
		infinite_loop(node, fileName, funcName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s contains an infinite loop.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), funcName));
		},
		int32_overflow(node, fileName, funcName, value) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Integer value %d cannot be internally represented.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), value));
		},
		float32_overflow(node, fileName, funcName, value, literal) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Real value %s cannot be internally represented.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), literal));
		},
		missing_return_control_flow(node, fileName, funcName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Some branches of function %s do not have a return statement.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), funcName));
		},
		shadowing(node, fileName, funcName, category, beforeScope, afterScope, variableName) {
			if (category === 'type') return;
			const scopeFragment = beforeScope === 'local' ? `locally declared` : `globally declared`;
			const categoryFragment = capitalize(category);
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s %s %s is already %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), categoryFragment, declName, scopeFragment));
		},
		string_too_long(node, fileName, funcName, value) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s String ( %s ) is too long to be loaded from a literal.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), util.inspect(value, {maxStringLength: 10})));
		},
		tdz_exception(node, fileName, funcName, lifeCycle, variableName) {
			if (lifeCycle !== 'deferred') return;
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Circular reference to variable %s in its redeclaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName));
		},
	},
};
