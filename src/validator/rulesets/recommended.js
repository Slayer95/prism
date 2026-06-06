"use strict";

const assert = require('assert/strict');
const util = require('util');

module.exports = {
	handlers: {
		bad_comparison(node, fileName, funcName, errorCategory, otherType) {
			switch (errorCategory) {
				case 'null vs primitive': {
					this.errors.push(util.format(`%s - Comparing equality of null against %s.`, fileName, otherType));
					break;
				}
				case 'real': {
					this.errors.push(util.format(`%s - Comparing equality of real against %s.`, fileName, otherType));
					break;
				}
			}
		},
		bad_null_assignment(node, fileName, funcName, expectedType, expressionType, initializerDesc) {
			this.errors.push(util.format(`%s - Expected a primitive (%s), but got null.`, fileName, expectedType));
		},
		constant_test(node, fileName, funcName, result) {
			this.errors.push(util.format(`%s - Condition is constant.`, fileName));
		},
		exitwhen_non_local(node, fileName, funcName) {
			this.errors.push(util.format(`%s - Loop exit condition only depends on external state.`, fileName));
		},
		needless_return(node, fileName, funcName) {
			this.errors.push(util.format(`%s - Needless return statement.`, fileName));
		},
		needless_return_multibranch(node, fileName, funcName) {
			this.errors.push(util.format(`%s - Needless return statement across conditional branches.`, fileName));
		},
		noop_code(node, fileName, funcName, nodeType, category) {
			this.errors.push(util.format(`%s - This instruction does nothing.`, fileName));
		},
		recursive_function(node, fileName, funcName, calleeName) {
			assert.equal(funcName, calleeName);
			this.warnings.push(util.format(`%s - Function %s calls itself.`, fileName, calleeName, returnType, funcName));
		},
		return_value_discarded(node, fileName, funcName, lifeCycle, calleeName, returnType) {
			this.warnings.push(util.format(`%s - Function %s returns an %s, but it's discarded in %s.`, fileName, calleeName, returnType, funcName));
		},
		test_constant(node, fileName, funcName, category, loopNode) {
			assert.equal(category, 'loop');
			this.errors.push(util.format(`%s - Condition is constant across all iterations.`, fileName));
		},
		test_non_local(node, fileName, funcName, loopNode) {
			assert.equal(category, 'loop');
			this.warnings.push(util.format(`%s - Condition inside a loop only depends on external state.`, fileName));
		},
		type_punning(node, fileName, toType, fromType, value, desc) {
			this.warnings.push(util.format(`%s - Casting %s value %s into %s.`, fileName, fromType, value, toType));
		},
		unreachable_code(unreachableNode, fileName, funcName, returnsNode) {
			this.errors.push(util.format(`%s - Unreachable code.`, fileName));
		},
		unused_function(node, fileName, funcName, varName) {
			this.errors.push(util.format(`%s - Function %s is never used.`, fileName, varName));
		},
		unused_global_variable(node, fileName, funcName, varName) {
			this.errors.push(util.format(`%s - Global variable %s is never used.`, fileName, varName));
		},
		unused_local_variable(node, fileName, funcName, varName, _) {
			this.errors.push(util.format(`%s - Local variable %s is never used.`, fileName, varName));
		},
		unused_parameter(node, fileName, funcName,  varName, _) {
			this.errors.push(util.format(`%s - Parameter %s of %s is unused.`, fileName, varName, funcName));
		},
	},
};
