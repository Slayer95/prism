"use strict";

//const assert = require('assert/strict');
const chalk = require('chalk');
const util = require('util');

const {capitalize, renderLintCode} = require('./../../../lib');

module.exports = {
	handlers: {
		api_too_early(eventName, node, fileName, funcName, apiName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s %s API cannot be used in a global declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), apiName);
		},

		array_access_off_bounds(eventName, node, fileName, funcName, arrayName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Invalid access to negative index of %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), arrayName);
		},

		call_bad_arity(eventName, node, fileName, funcName, lifeCycle, calleeName, parameterCount, argumentCount) {
			if (lifeCycle !== 'deferred') return;
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s expects %d arguments, but was called with %d.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), calleeName, parameterCount, argumentCount);
		},
		char_signedness(eventName, node, fileName, funcName, literal, expected, actual) { 
			// This may not look like a big deal, but it makes files invalid UTF8, so this rule is sound-level.
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Char %s is >= 128, so it will equal %s rather than %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), literal, actual, expected);
		},
		exitwhen_constant(eventName, node, fileName, funcName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Loop exit condition is constant across all iterations.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`));
		},
		funarg_native(eventName, node, fileName, funcName, calleeName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Native function %s cannot be an argument for higher-order functions.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), calleeName);
		},
		funarg_not_nullary(eventName, node, fileName, funcName, calleeName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s accepts parameters, so it cannot an argument for higher-order functions.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), calleeName);
		},
		function_non_existent(eventName, node, fileName, funcName, lifeCycle, calleeName) {
			if (lifeCycle !== 'deferred') return;
			if (this.deferEvent(eventName, node, fileName, funcName, lifeCycle, calleeName)) return;
			const definedNode = this.getSymbol(funcName)?.node;
			if (!definedNode) {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s is not defined.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), calleeName);
			}
		},
		higher_order_type_mismatch(eventName, node, fileName, funcName, lowerExpectedReturnType, lowerActualReturnType, higherName, lowerName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s accepts functions that return '%s', but %s returns '%s'.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), higherName, lowerExpectedReturnType, lowerName, lowerActualReturnType);
		},
		infinite_loop(eventName, node, fileName, funcName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s contains an infinite loop.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), funcName);
		},
		int32_overflow(eventName, node, fileName, funcName, value) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Integer value %d cannot be internally represented.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), value);
		},
		float32_overflow(eventName, node, fileName, funcName, value, literal) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Real value %s cannot be internally represented.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), literal);
		},
		fourcc_signedness(eventName, node, fileName, funcName, literal, expected, actual, actualHex) { 
			// This may not look like a big deal, but it makes files invalid UTF8, so this rule is sound-level.
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Rawcode %s contains bytes >= 0x80, so it will equal %s (%s) rather than %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), literal, actual, actualHex, expected);
		},
		lossy_type_cast(eventName, node, fileName, funcName, toType, fromType, certainty, value, desc) {
			if (certainty !== 'resolved') return;
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Casting %s value %d into %s loses precision.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), fromType, value, toType);
		},
		missing_return_control_flow(eventName, node, fileName, funcName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Some branches of function %s do not have a return statement.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), funcName);
		},
		number_type_reinterpret(eventName, node, fileName, funcName, toType, fromType, value, desc) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Implicit bit-level reinterpretation of %s value %s into mangled %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), fromType, value, toType);
		},
		never_initialized_local(eventName, node, fileName, funcName, varName, varType) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Local variable %s of type '%s' was never initialized in %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), varName, varType, funcName);
		},
		never_initialized_global(eventName, node, fileName, funcName, varName, varType) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Global variable %s of type '%s' was never initialized.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), varName, varType);
		},
		shadowing(eventName, node, fileName, funcName, category, beforeScope, afterScope, variableName) {
			if (category === 'type') return;
			const scopeFragment = beforeScope === 'local' ? `locally declared` : `globally declared`;
			const categoryFragment = capitalize(category);
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s %s %s is already %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), categoryFragment, variableName, scopeFragment);
		},
		string_too_long(eventName, node, fileName, funcName, value) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s String ( %s ) is too long to be loaded from a literal.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), util.inspect(value, {maxStringLength: 10}));
		},
		tdz_exception(eventName, node, fileName, funcName, lifeCycle, variableName) {
			if (lifeCycle !== 'deferred') return;
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Circular reference to variable %s in its redeclaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), variableName);
		},
		too_many_parameters(eventName, node, fileName, funcName, declName, parameterCount, maxCount) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s is declared with %d parameters. They must be less than %d.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), declName, parameterCount, maxCount);
		},
		void_constant_function(eventName, node, fileName, funcName, declName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s is declared constant, but returns nothing.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`sound/${eventName}`), declName);
		},
	},
};
