"use strict";

const assert = require('assert/strict');
const chalk = require('chalk');

const {renderLintCode} = require('./../../../lib');

module.exports = {
	handlers: {
		array_access_incompatible(eventName, node, fileName, funcName, variableName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Variable %s is not an array.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), variableName);
		},
		array_access_required(eventName, node, fileName, funcName, operation, variableName) {
			if (operation === 'write') {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Index is required in order to write to array %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), variableName);
			} else {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Index is required in order to read array %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), variableName);
			}
		},
		array_unsupported(eventName, node, fileName, funcName, atomicType) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Arrays of type '%s' are not supported. Try to work-around using a trigger array.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), atomicType);
		},
		binding_constant(eventName, node, fileName, funcName, bindName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Cannot assign a new value to constant %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), bindName);
		},
		call_bad_arity(eventName, node, fileName, funcName, lifeCycle, calleeName, parameterCount, argumentCount) {
			if (lifeCycle !== 'eager') return;
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s expects %d arguments, but was called with %d.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), calleeName, parameterCount, argumentCount);
		},
		const_function_violation(eventName, node, fileName, category, refSymbol, calleeName) {
			if (category === 'call') {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Cannot call non-constant function %s from constant function %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), refSymbol, calleeName);
			} else {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Cannot set global variable %s from constant function %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), refSymbol, calleeName);
			}
		},
		function_bad_type(eventName, node, fileName, funcName, calleeName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Cannot call %s, which is not a function.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), calleeName);
		},
		function_non_existent(eventName, node, fileName, funcName, lifeCycle, calleeName) {
			if (lifeCycle !== 'eager') return;
			if (this.deferEvent(eventName, node, fileName, funcName, lifeCycle, calleeName)) return;
			const definedNode = this.getSymbol(funcName)?.node;
			if (definedNode) {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Cannot call function %s before it's defined. Relocate it from L%d, or call it indirectly with TriggerExecute or ExecuteFunc.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), calleeName, definedNode.startPosition.row + 1);
			} else {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s is not defined.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), calleeName);
			}
		},
		missing_return(eventName, node, fileName, funcName, returnType) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s is expected to return %s, but has no return statements.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), funcName, returnType);
		},
		non_extensible(eventName, node, fileName, funcName, declName, superName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Type '%s' cannot be extended onto %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), superName, declName);
		},
		recursive_function_local(eventName, node, fileName, funcName, calleeName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s cannot invoke itself from a local declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), funcName);
		},
		reserved_word(eventName, node, fileName, funcName, keyWord) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Keyword '%s' is reserved.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), keyWord);
		},
		return_null_primitive(eventName, node, fileName, funcName, expectedType, expressionType, initializerDesc) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function '%s' must return an %s, not null.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), funcName, expectedType);
		},
		return_value_required(eventName, node, fileName, funcName, returnType) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Returned value of type %s is missing from %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), returnType, funcName);
		},
		return_value_unexpected(eventName, node, fileName, funcName, retNode) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Value returned from function %s which declares "returns nothing".\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), funcName);
		},
		shadowing(eventName, node, fileName, funcName, category, beforeScope, afterScope, declName) {
			if (category !== 'type') return;
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Type %s is already declared.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), declName);
		},
		tdz_exception(eventName, node, fileName, funcName, lifeCycle, variableName) {
			if (lifeCycle !== 'eager') return;
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Circular reference to variable %s in its declaration.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), variableName);
		},
		ternary_boolean(eventName, node, fileName, funcName, expectedType, expressionType, initializerDesc) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Expected a boolean, but got null.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), expectedType);
		},
		type_mismatch(eventName, node, fileName, funcName, expectedType, actualType, desc) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s %s expected to be %s, but is %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), desc, expectedType, actualType);
		},
		type_missing(eventName, node, fileName, funcName, typeName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Type %s does not exist.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), typeName);
		},
		unexpected_type(eventName, node, fileName, funcName, category, typeName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Type name '%s' cannot be reused as a %s name.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), typeName, category);
		},
		variable_non_existent(eventName, node, fileName, funcName, variableName) {
			if (funcName === '~') {
				if (this.deferEvent(eventName, node, fileName, funcName, variableName)) return;
				const definedNode = this.getSymbol(variableName)?.node;
				if (definedNode) {
					this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Cannot refer to global variable %s before it's defined. Relocate it from L%d.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), variableName, definedNode.startPosition.row + 1);
				} else {
					this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Global variable %s does not exist.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), variableName);
				}
			} else {
				this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Variable %s does not exist in the scope of %s.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), variableName, funcName);
			}
		},
		void_call_as_expression(eventName, node, fileName, funcName, calleeName) {
			this.error(`%s:%s\n\n  %s\n\n  %s\n  %%s Function %s returns nothing, so it requires the 'call' keyword.\n`, chalk.yellow(fileName), chalk.yellow(node.startPosition.row), renderLintCode(node.text), chalk.cyan(`core/${eventName}`), calleeName);
		},
	},
};
