"use strict";

const assert = require('assert/strict');
const chalk = require('chalk');
const util = require('util');

const {renderLintCode} = require('./../../../lib');

module.exports = {
	handlers: {
		array_access_incompatible(node, fileName, funcName, variableName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Variable %s is not an array.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName));
		},
		array_access_required(node, fileName, funcName, operation, variableName) {
			if (operation === 'write') {
				this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Index is required in order to write to array %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName));
			} else {
				this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Index is required in order to read array %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName));
			}
		},
		array_unsupported(node, fileName, funcName, atomicType) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Arrays of type '%s' are not supported. Try to work-around using a trigger array.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), atomicType));
		},
		binding_constant(node, fileName, funcName, bindName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Cannot assign a new value to constant %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), bindName));
		},
		call_bad_arity(node, fileName, funcName, lifeCycle, calleeName, parameterCount, argumentCount) {
			if (lifeCycle !== 'eager') return;
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s expects %d arguments, but was called with %d.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName, parameterCount, argumentCount));
		},
		const_function_violation(node, fileName, category, refSymbol, calleeName) {
			if (category === 'call') {
				this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Cannot call non-constant function %s from constant function %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), refSymbol, funcName));
			} else {
				this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Cannot set global variable %s from constant function %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), refSymbol, funcName));
			}
		},
		function_bad_type(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Cannot call %s, which is not a function.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName));
		},
		function_non_existent(node, fileName, funcName, lifeCycle, calleeName) {
			if (lifeCycle !== 'eager') return;
			if (this.deferEvent(node, fileName, funcName, lifeCycle)) return;
			const definedNode = this.getSymbol(funcName)?.node;
			if (definedNode) {
				this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Cannot call function %s before it's defined. Relocate it from L%d, or call it indirectly with TriggerExecute or ExecuteFunc.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName, definedNode.startPosition.row + 1));
			} else {
				this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s is not defined.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName));
			}
		},
		missing_return(node, fileName, funcName, returnType) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s is expected to return %s, but has no return statements.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), funcName, returnType));
		},
		non_extensible(node, fileName, funcName, declName, superName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Type '%s' cannot be extended onto %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), superName, declName));
		},
		recursive_function_local(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s cannot invoke itself from a local declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), funcName));
		},
		return_value_required(node, fileName, funcName, returnType) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Returned value of type %s is missing from %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), returnType, funcName));
		},
		return_value_unexpected(node, fileName, funcName, retNode) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Value returned from function %s which declares "returns nothing".\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), funcName));
		},
		shadowing(node, fileName, funcName, category, beforeScope, afterScope, declName) {
			if (category !== 'type') return;
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Type %s is already declared.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), declName));
		},
		tdz_exception(node, fileName, funcName, lifeCycle, variableName) {
			if (lifeCycle !== 'eager') return;
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Circular reference to variable %s in its declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName));
		},
		type_mismatch(node, fileName, funcName, expectedType, actualType, desc) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s %s expected to be %s, but is %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), desc, expectedType, actualType));
		},
		type_missing(node, fileName, funcName, typeName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Type %s does not exist.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), typeName));
		},
		variable_non_existent(node, fileName, funcName, variableName) {
			if (funcName === '~') {
				if (this.deferEvent(node, fileName, funcName, variableName)) return;
				const definedNode = this.getSymbol(variableName)?.node;
				if (definedNode) {
					this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Cannot refer to global variable %s before it's defined. Relocate it from L%d.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName, definedNode.startPosition.row + 1));
				} else {
					this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Global variable %s does not exist.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName));
				}
			} else {
				this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Variable %s does not exist in the scope of %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), variableName, funcName));
			}
		},
		void_call_as_expression(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s:%s\n\n  %s\n\n  %%s Function %s returns nothing, so it requires the 'call' keyword.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), calleeName));
		},
	},
};
