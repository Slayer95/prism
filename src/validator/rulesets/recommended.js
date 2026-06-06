"use strict";

const assert = require('assert/strict');
const chalk = require('chalk');
const util = require('util');

const {renderLintCode} = require('./../../../lib');

module.exports = {
	handlers: {
		bad_comparison(node, fileName, funcName, errorCategory, otherType) {
			switch (errorCategory) {
				case 'null vs primitive': {
					this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Comparing equality of null against %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), otherType));
					break;
				}
				case 'real': {
					this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Comparing equality of real against %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), otherType));
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
		exitwhen_non_local(node, fileName, funcName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Loop exit condition only depends on external state.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text)));
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
		recursive_function(node, fileName, funcName, calleeName) {
			assert.equal(funcName, calleeName);
			this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s calls itself.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName));
		},
		return_value_discarded(node, fileName, funcName, lifeCycle, calleeName, returnType) {
			this.warnings.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s returns '%s', but it's discarded in %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName, returnType, funcName));
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
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s is never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName));
		},
		unused_global_variable(node, fileName, funcName, varName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Global variable %s is never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName));
		},
		unused_local_variable(node, fileName, funcName, varName, _) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Local variable %s is never used.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName));
		},
		unused_parameter(node, fileName, funcName,  varName, _) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Parameter %s of %s is unused.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), varName, funcName));
		},
	},
};
