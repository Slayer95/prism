"use strict";

const assert = require('assert/strict');
const util = require('util');

module.exports = {
	handlers: {
		api_too_early(node, fileName, funcName, apiName) {
			this.errors.push(util.format(`%s - %s API cannot be used in a global declaration.`, fileName, apiName);
		},

		array_access_off_bounds(node, fileName, funcName, arrayName) {
			this.errors.push(util.format(`%s - Invalid access to negative index of %s.`, fileName, arrayName);
		},

		call_bad_arity(node, fileName, funcName, lifeCycle, calleeName, parameterCount, argumentCount) {
			if (lifeCycle !== 'deferred') return;
			this.errors.push(util.format(`%s - Function %s expects %d arguments, but was called with %d.`, fileName, calleeName, parameterCount, argumentCount));
		},
		exitwhen_constant(node, fileName, funcName) {
			this.errors.push(util.format(`%s - Loop exit condition is constant across all iterations.`));
		},
		funarg_native(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s - Native function %s cannot be an argument for higher-order functions.`, fileName, calleeName));
		},
		funarg_not_nullary(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s - Function %s accepts parameters, so it cannot an argument for higher-order functions.`, fileName, calleeName));
		},
		function_non_existent(node, fileName, funcName, lifeCycle, calleeName) {
			if (lifeCycle !== 'deferred') return;
			if (this.deferEvent(node, fileName, funcName, lifeCycle)) return;
			const definedNode = this.getSymbol(funcName)?.node;
			if (!definedNode) {
				this.errors.push(util.format(`%s - Function %s is not defined.`, fileName, calleeName));
			}
		},
		higher_order_type_mismatch(node, fileName, funcName, lowerExpectedReturnType, lowerActualReturnType, higherName, lowerName) {
			this.errors.push(util.format(`%s - Function %s accepts functions that return '%s', but %s returns '%s'.`, fileName, higherName, lowerExpectedReturnType, lowerName, lowerActualReturnType));
		},
		infinite_loop(node, fileName, funcName) {
			this.errors.push(util.format(`%s - Function %s contains an infinite loop.`, fileName, funcName));
		},
		int32_overflow(node, fileName, funcName, value) {
			this.errors.push(util.format(`%s - Integer value %d cannot be internally represented.`, fileName, value));
		},
		float32_overflow(node, fileName, funcName, value, literal) {
			this.errors.push(util.format(`%s - Real value %s cannot be internally represented.`, fileName, literal));
		},
		missing_return_control_flow(node, fileName, funcName) {
			this.errors.push(util.format(`%s - Some branches of function %s do not have a return statement.`, fileName, funcName));
		},
		shadowing(node, fileName, funcName, category, beforeScope, afterScope, variableName) {
			if (category === 'type') return;
			const scopeFragment = beforeScope === 'local' ? `locally declared` : `globally declared`;
			const categoryFragment = capitalize(category);
			this.errors.push(util.format(`%s - %s %s is already %s.`, fileName, categoryFragment, declName, scopeFragment));
		},
		string_too_long(node, fileName, funcName, value) {
			this.errors.push(util.format(`%s - String ( %s ) is too long to be loaded from a literal.`, fileName, util.inspect(value, {maxStringLength: 10})));
		},
		tdz_exception(node, fileName, funcName, lifeCycle, variableName) {
			if (lifeCycle !== 'deferred') return;
			this.errors.push(util.format(`%s - Circular reference to variable %s in its redeclaration.`, fileName, variableName));
		},
	},
};
