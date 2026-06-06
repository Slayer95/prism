"use strict";

const assert = require('assert/strict');
const util = require('util');

module.exports = {
	handlers: {
		array_access_incompatible(node, fileName, funcName, variableName) {
			this.errors.push(util.format(`%s - Variable %s is not an array.`, variableName));
		},
		array_access_required(node, fileName, funcName, operation, variableName) {
			if (operation === 'write') {
				this.errors.push(util.format(`%s - Index is required in order to write to array %s.`, variableName));
			} else {
				this.errors.push(util.format(`%s - Index is required in order to read array %s.`, variableName));
			}
		},
		array_unsupported(node, fileName, funcName, atomicType) {
			this.errors.push(util.format(`%s - Arrays of type '%s' are not supported. Try to work-around using a trigger array.`, fileName, atomicType));
		},
		binding_constant(node, fileName, funcName, bindName) {
			this.errors.push(util.format(`%s - Cannot assign a new value to constant %s.`, fileName, bindName));
		},
		call_bad_arity(node, fileName, funcName, lifeCycle, calleeName, parameterCount, argumentCount) {
			if (lifeCycle !== 'eager') return;
			this.errors.push(util.format(`%s - Function %s expects %d arguments, but was called with %d.`, fileName, calleeName, parameterCount, argumentCount));
		},
		const_function_violation(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s - Cannot call non-constant function %s from constant function %s.`, fileName, calleeName, funcName));
		},
		function_bad_type(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s - Cannot call %s, which is not a function.`, fileName, calleeName));
		},
		function_non_existent(node, fileName, funcName, lifeCycle, calleeName) {
			if (lifeCycle !== 'eager') return;
			if (this.deferEvent(node, fileName, funcName, lifeCycle)) return;
			const definedNode = this.getSymbol(funcName)?.node;
			if (definedNode) {
				this.errors.push(util.format(`%s - Cannot call function %s before it's defined. Relocate it from L%d, or call it indirectly with TriggerExecute or ExecuteFunc.`, fileName, calleeName, definedNode.startPosition.row + 1));
			} else {
				this.errors.push(util.format(`%s - Function %s is not defined.`, fileName, calleeName));
			}
		},
		missing_return(node, fileName, funcName, returnType) {
			this.errors.push(util.format(`%s - Function %s is expected to return %s, but has no return statements.`, fileName, funcName, returnType));
		},
		recursive_function_local(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s - Function %s cannot invoke itself from a local declaration.`, fileName, funcName));
		},
		return_value_required(node, fileName, funcName, returnType) {
			this.errors.push(util.format(`%s - Returned value of type %s is missing from %s.`, fileName, returnType, funcName));
		},
		return_value_unexpected(node, fileName, funcName, retNode) {
			this.errors.push(util.format(`%s - Value returned from function %s which declares "returns nothing".`, fileName, funcName));
		},
		shadowing(node, fileName, funcName, category, beforeScope, afterScope, declName) {
			if (category !== 'type') return;
			this.errors.push(util.format(`%s - Type %s is already declared.`, fileName, declName));
		},
		tdz_exception(node, fileName, funcName, lifeCycle, variableName) {
			if (lifeCycle !== 'eager') return;
			this.errors.push(util.format(`%s - Circular reference to variable %s in its declaration.`, fileName, variableName));
		},
		type_missing(node, fileName, funcName, typeName) {
			this.errors.push(util.format(`%s - Type %s does not exist.`, fileName, typeName);
		},
		variable_non_existent(node, fileName, funcName, variableName) {
			if (funcName === '~') {
				if (this.deferEvent(node, fileName, funcName, variableName)) return;
				const definedNode = this.getSymbol(variableName)?.node;
				if (definedNode) {
					this.errors.push(util.format(`%s - Cannot refer to global variable %s before it's defined. Relocate it from L%d.`, fileName, calleeName, definedNode.startPosition.row + 1));
				} else {
					this.errors.push(util.format(`%s - Global variable %s does not exist.`, fileName, variableName));
				}
			} else {
				this.errors.push(util.format(`%s - Variable %s does not exist in the scope of %s.`, fileName, variableName, funcName);
			}
		},
		void_call_as_expression(node, fileName, funcName, calleeName) {
			this.errors.push(util.format(`%s - Function %s returns nothing, so it requires the 'call' keyword.`, fileName, calleeName);
		},
	},
};
