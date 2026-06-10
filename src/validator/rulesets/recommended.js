"use strict";

const assert = require('assert/strict');
const chalk = require('chalk');

const {renderLintCode} = require('./../../../lib');

const IGNORED_RETURN_TYPES = ['triggercondition', 'triggeraction', 'event'];

module.exports = {
	handlers: {
		api_receiver_unsafe_null(eventName, node, fileName, funcName, calleeName, variableName, variableType) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s %s should not be called on nullable %s '%s'.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), calleeName, variableType, variableName);
		},
		bad_comparison(eventName, node, fileName, funcName, errorCategory, otherType) {
			switch (errorCategory) {
				case 'null vs primitive': {
					this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Comparing equality of null against %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), otherType);
					break;
				}
				case 'real_literal': {
					this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Comparing equality of literal real against %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), otherType);
					break;
				}
				case 'real': {
					this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Comparing equality of real against %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), otherType);
					break;
				}
			}
		},
		bad_null_assignment(eventName, node, fileName, funcName, expectedType, expressionType, initializerDesc) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Expected a primitive (%s), but got null.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), expectedType);
		},
		constant_test(eventName, node, fileName, funcName, result) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Condition is constant.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text));
		},
		dangling_global_handle(eventName, node, fileName, funcName, variableName, variableType, nextInstruction) {
			this.error(`%s:%s\n\n  %s\n  %s\n\n  %s\n  %%s Global %s handle %s is destroyed but not immediately nulled nor reassigned.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), nextInstruction ? renderLintCode(nextInstruction.text) : '', variableType, variableName);
		},
		exitwhen_non_local(eventName, node, fileName, funcName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Loop exit condition only depends on external state.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`));
		},
		local_handle_not_nulled(eventName, node, fileName, funcName, varName, varType, lastValueNode) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Local handle '%s' of type '%s' is not nulled.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), varName, varType);
		},
		lossy_type_cast(eventName, node, fileName, funcName, toType, fromType, certainty, value, desc) {
			if (certainty !== 'unknown') return;
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Casting %s value %s into %s may lose precision.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), fromType, value, toType);
		},
		native_after_function(eventName, node, fileName, funcName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Native %s defined after function declarations.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), funcName);
		},
		needless_return(eventName, node, fileName, funcName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Needless return statement.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`));
		},
		needless_return_multibranch(eventName, node, fileName, funcName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Needless return statement across conditional branches.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`));
		},
		noop_code(eventName, node, fileName, funcName, nodeType, category) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s This instruction does nothing.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`));
		},
		null_string(eventName, node, fileName, funcName, expectedType, expressionType, initializerDesc) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Expected a string, but got null.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), expectedType);
		},
		number_type_punning(eventName, node, fileName, funcName, toType, fromType, value, desc) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Casting %s value %d into %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), fromType, value, toType);
		},
		prefer_constant_variable(eventName, node, fileName, funcName, variableName, variableType) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Global variable %s of type %s is never reassigned. Prefer declaration with 'constant %s'.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), variableName, variableType, variableType);
		},
		prefer_constant_function(eventName, node, fileName, funcName, variableName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s only calls 'constant' functions. Prefer 'constant function' declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), variableName);
		},
		recursive_function(eventName, node, fileName, funcName, calleeName) {
			assert.equal(funcName, calleeName);
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s calls itself.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), calleeName);
		},
		return_value_discarded(eventName, node, fileName, funcName, lifeCycle, calleeName, returnType) {
			if (IGNORED_RETURN_TYPES.includes(returnType)) return;
			assert.notEqual(this.controlFlow.aboutFunctions.size, 0);
			const aboutFn = this.controlFlow.aboutFunctions.get(calleeName);
			if (!aboutFn /* Native function */ || !aboutFn.return.global /* Return is teed to a global variable */) {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s returns '%s', but it's discarded in %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), calleeName, returnType, funcName);
			}
		},
		test_constant(eventName, node, fileName, funcName, category, loopNode) {
			assert.equal(category, 'loop');
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Condition is constant across all iterations.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text));
		},
		test_non_local(eventName, node, fileName, funcName, category, loopNode) {
			assert.equal(category, 'loop');
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Condition inside a loop only depends on external state.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text));
		},
		unescaped_control(eventName, node, fileName, funcName, c) {
			if (c === '\r' || c === '\n') {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Use escape sequence %j instead of literal ${c === '\r' ? 'CR' : 'LF'} linebreak.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), c);
			} else {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Use escape sequence %j instead of control character ${c.charCodeAt(0).toString(16).padStart(2, '0')}.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), c);
			}
		},
		unreachable_code(eventName, unreachableNode, fileName, funcName, returnsNode) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Unreachable code.\n`, chalk.yellow(fileName), chalk.yellow(unreachableNode.startPosition.row), renderLintCode(unreachableNode.text), chalk.cyan(`recommended/${eventName}`));
		},
		unused_function(eventName, node, fileName, funcName, varName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s is defined but never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), varName);
		},
		unused_global_variable(eventName, node, fileName, funcName, varName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Global variable %s is defined but never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), varName);
		},
		unused_local_variable(eventName, node, fileName, funcName, varName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Local variable %s is defined but never used in %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), varName, funcName);
		},
		unused_parameter(eventName, node, fileName, funcName, varName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Parameter '%s' of %s is defined but never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`recommended/${eventName}`), varName, funcName);
		},
	},
};
