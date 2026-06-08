"use strict";

const assert = require('assert/strict');
const chalk = require('chalk');
const util = require('util');

const {renderLintCode} = require('./../../../lib');

const IGNORED_RETURN_TYPES = ['triggercondition', 'triggeraction', 'event'];

module.exports = {
	handlers: {
		api_receiver_unsafe_null(node, fileName, funcName, calleeName, variableName, variableType) {
			this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s %s should not be called on nullable %s '%s'.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName, variableType, variableName));
		},
		bad_comparison(node, fileName, funcName, errorCategory, otherType) {
			switch (errorCategory) {
				case 'null vs primitive': {
					this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Comparing equality of null against %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), otherType));
					break;
				}
				case 'real_literal': {
					this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Comparing equality of literal real against %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), otherType));
					break;
				}
				case 'real': {
					this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Comparing equality of real against %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), otherType));
					break;
				}
			}
		},
		bad_null_assignment(node, fileName, funcName, expectedType, expressionType, initializerDesc) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Expected a primitive (%s), but got null.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), expectedType));
		},
		constant_test(node, fileName, funcName, result) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Condition is constant.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text)));
		},
		dangling_global_handle(node, fileName, funcName, variableName, variableType, nextInstruction) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n  %s\n\n  %%s Global %s handle %s is destroyed but not immediately nulled nor reassigned.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), nextInstruction ? renderLintCode(nextInstruction.text) : '', variableType, variableName));
		},
		exitwhen_non_local(node, fileName, funcName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Loop exit condition only depends on external state.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text)));
		},
		local_handle_not_nulled(node, fileName, funcName, varName, varType, lastValueNode) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Local handle '%s' of type '%s' is not nulled.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName, varType));
		},
		lossy_type_cast(node, fileName, funcName, toType, fromType, certainty, value, desc) {
			if (certainty !== 'unknown') return;
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Casting %s value %d into %s may lose precision.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), fromType, value, toType));
		},
		needless_return(node, fileName, funcName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Needless return statement.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text)));
		},
		needless_return_multibranch(node, fileName, funcName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Needless return statement across conditional branches.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text)));
		},
		noop_code(node, fileName, funcName, nodeType, category) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s This instruction does nothing.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text)));
		},
		number_type_punning(node, fileName, funcName, toType, fromType, value, desc) {
			this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Casting %s value %d into %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), fromType, value, toType));
		},
		prefer_constant_variable(node, fileName, funcName, variableName, variableType) {
			this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Global variable %s of type %s is never reassigned. Prefer declaration with 'constant %s'.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName, variableType, variableType));
		},
		prefer_constant_function(node, fileName, funcName, variableName) {
			this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s only calls 'constant' functions. Prefer 'constant function' declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName));
		},
		recursive_function(node, fileName, funcName, calleeName) {
			assert.equal(funcName, calleeName);
			this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s calls itself.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName));
		},
		return_value_discarded(node, fileName, funcName, lifeCycle, calleeName, returnType) {
			if (IGNORED_RETURN_TYPES.includes(returnType)) return;
			assert.notEqual(this.controlFlow.aboutFunctions.size, 0);
			const aboutFn = this.controlFlow.aboutFunctions.get(calleeName);
			if (!aboutFn /* Native function */ || !aboutFn.return.global /* Return is teed to a global variable */) {
				this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s returns '%s', but it's discarded in %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName, returnType, funcName));
			}
		},
		test_constant(node, fileName, funcName, category, loopNode) {
			assert.equal(category, 'loop');
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Condition is constant across all iterations.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text)));
		},
		test_non_local(node, fileName, funcName, category, loopNode) {
			assert.equal(category, 'loop');
			this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Condition inside a loop only depends on external state.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text)));
		},
		unreachable_code(unreachableNode, fileName, funcName, returnsNode) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Unreachable code.\n`, chalk.yellow(fileName), chalk.yellow(unreachableNode.startPosition.row), renderLintCode(unreachableNode.text)));
		},
		unused_function(node, fileName, funcName, varName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s is defined but never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName));
		},
		unused_global_variable(node, fileName, funcName, varName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Global variable %s is defined but never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName));
		},
		unused_local_variable(node, fileName, funcName, varName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Local variable %s is defined but never used in %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName, funcName));
		},
		unused_parameter(node, fileName, funcName, varName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Parameter '%s' of %s is defined but never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName, funcName));
		},
	},
};
