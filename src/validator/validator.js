"use strict";

const assert = require('assert/strict');
const EventEmitter = require('events');
const Parser = require('tree-sitter');
const JASS = require('tree-sitter-jass');

const {ValidatorResult} = require('./../../lib/constants');
const {internalTypes, isPrimitiveType, isAPINeedsInitialization} = require('./../../lib');

function findChildNamed(node, name) {
	const children = node.childrenForFieldName(name);
	if (children.length) return children[0];
	return null;
}

function ensureKind(node, type) {
	if (node.type !== type) return null;
	return node;
}

const symbolHelpers = {
	extractParameters(node /* FunctionParameterList | Empty */) {
		if (node.type === 'Empty') {
			return [];
		} else {
			assert.equal(node.type, 'FunctionParameterList');
			const list = [];
			node = node.firstChild;
			do {
				assert.equal(node.type, 'FunctionParameter');
				list.push([
					findChildNamed(node, 'type').text,
					findChildNamed(node, 'name').text,
				]);
			} while (node = node.nextNamedSibling)
			return list;
		}
	},
	extractReturnType(node /* None | TypeReference */) {
		if (node.type === 'None') {
			return null;
		}
		assert.equal(node.type, 'TypeReference');
		return node.text;
	},
};

function isArrayType(typeNode) {
	return typeNode.childCount > 1;
}

function getSelfOrNextSignificantSibling(node) {
	while (node && (node.type === 'Comment' || node.type === 'NewLine')) {
		node = node.nextSibling;
	}

	return node || null;
}

function getNextSignificantSibling(node) {
	do {
		node = node.nextSibling;
	} while (node && (node.type === 'Comment' || node.type === 'NewLine'));

	return node || null;
}

class TypeInfo {
	constructor(name, parentType, onlyAtomic = false) {
		this.name = name;
		this.superTypes = parentType ? [parentType.name, ...parentType.superTypes] : [];
		this.onlyAtomic = false;
	}

	getExtends(superType) {
		return this.superTypes.includes(superType);
	}
}

class Validator extends EventEmitter {
	constructor(options) {
		super()
		this.options = options;
		this.result = ValidatorResult.kOk;
		this.warnings = this.options.quiet ? null : [];
		this.errors = this.options.quiet ? null : [];
		this.currentFile = '';
		this.symbols = {
			types: this.getInternalTypes(),
			global: new Map(),
			local: new Map(),
			currentFunction: '',
			currentLocal: null,
		};
	}

	reset() {
		this.result = ValidatorResult.kOk;
		this.warnings = this.options.quiet ? null : [];
		this.errors = this.options.quiet ? null : [];
		this.symbols = {
			types: this.getInternalTypes(),
			global: new Map(),
			local: new Map(),
			currentFunction: '',
			currentLocal: null,
		};
	}

	getContextFunctionSignature(node) {
		let parentNode = node.closest('FunctionDeclaration');
		let funcName = '~';
		if (parentNode?.type === 'FunctionDeclaration') {
			let signatureNode = parentNode.firstNamedChild;
			if (signatureNode.type === 'FunctionSignature') {
				return signatureNode;
			}
			return ensureKind(signatureNode.nextNamedSibling, 'FunctionSignature');
		}
		return null;
	}

	emitNodeEvent(node, eventName, ...rest) {
		const funcName = this.currentFunction || '~';
		if (eventName !== 'return_value_discarded' && eventName !== 'recursive_function') {
			console.log(this.currentFile, funcName, node, eventName, ...rest, node.text);
		}
		return this.emit(this.currentFile, funcName, node, eventName, ...rest);
	}

	getInternalTypes() {
		return new Map(internalTypes.map(name => [name, new TypeInfo(name, null, name === 'code')]));
	}

	resetLocalSymbols() {
		this.symbols.local.clear();
		this.symbols.currentFunction = '';
	}

	checkTreeInner(filePath, cst, source) {
		this.currentFile = filePath;

		const cursor = cst.rootNode.walk();
		let reachedRoot = false;

		while (!reachedRoot) {
			const node = cursor.currentNode;

			this.handleNodeStart(node);

			if (cursor.gotoFirstChild()) {
				continue;
			}

			this.handleNodeEnd(cursor.currentNode);

			if (cursor.gotoNextSibling()) {
				continue;
			}

			while (true) {
				if (!cursor.gotoParent()) {
					reachedRoot = true;
					break;
				}

				this.handleNodeEnd(cursor.currentNode);

				if (cursor.gotoNextSibling()) {
					break;
				}
			}
		}
	}

	checkTree(filePath, cst, source) {
		this.checkTreeInner(filePath, cst, source);

		const out = this.getOutput();
		this.reset();
		return out;
	}

	checkTrees(trees) {
		for (const [filePath, {cst, source}] of trees) {
			this.checkTreeInner(filePath, cst, source);
		}

		const out = this.getOutput();
		this.reset();
		return out;
	}

	registerType(node, symbolName, superName) {
		this.symbols.types.set(symbolName, new TypeInfo(symbolName, this.symbols.types.get(superName)));
	}

	registerFunction(node /* FunctionSignature */, symbolName) {
		const parentNode = node.parent;
		const isConstant = parentNode.firstNamedChild.type === 'ConstantAttribute';
		const isNative = parentNode.type === 'NativeDeclaration';
		this.symbols.global.set(symbolName, {
			node: node,
			type: 'code',
			parameters: symbolHelpers.extractParameters(findChildNamed(node, 'input')),
			returnType: symbolHelpers.extractReturnType(findChildNamed(node, 'output')),
			isConstant,
			isNative,
		});
	}

	registerGlobalVariable(node /* GlobalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayType(typeNode);
		this.symbols.global.set(symbolName, {
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: !isArray && node.firstChild.type === 'ConstantAttribute',
		});
	}

	registerLocalVariable(node /* LocalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayType(typeNode);
		this.symbols.local.set(symbolName, {
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: !isArray && node.firstChild.type === 'ConstantAttribute',
		});
	}

	prepareRegisterLocalVariable(node /* LocalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayType(typeNode);
		this.symbols.currentLocal = [symbolName, {
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: !isArray && node.firstChild.type === 'ConstantAttribute',
			isTDZ: !isArray,
		}];
	}

	finishRegisterLocalVariable(currentLocal) {
		currentLocal[1].isTDZ = false;
		this.symbols.local.set(currentLocal[0], currentLocal[1]);
	}

	registerLocalVariableFromParameter(node /* FunctionDeclaration */, symbolName, declType) {
		this.symbols.local.set(symbolName, {
			node: node,
			type: declType,
			isArray: false,
			isConstant: false,
		});
	}

	resolveExpressionType(node /* any of Expression (inlined) nodes */) {
		// Some call sites hand this wrapper node to the resolver.
		if (node.type === 'FunctionArgument' || node.type === 'ParenthesizedExpression') {
			const inner = node.firstNamedChild;
			return inner ? this.resolveExpressionType(inner) : 'unknown';
		}

		switch (node.type) {
			case 'Literal': {
				const inner = node.firstNamedChild;
				const text = inner.text;

				switch (inner.type) {
					case 'Null':
						return 'null';

					case 'Boolean':
						return 'boolean';

					case 'String':
						return 'string';

					case 'DecimalInteger': 
					case 'OctalInteger': 
					case 'HexInteger': 
					case 'FourCC': 
					case 'Byte':
						return 'integer';

					case 'Real':
						return 'real';

					default:
						throw new Error(`Unreachable (literal type was ${inner.type})`);
				}
			}

			case 'VariableReference': {
				const symbol = this.getSymbol(node.text);
				return symbol ? symbol.type : 'unknown';
			}

			case 'ArrayElement': {
				const arrayNode = findChildNamed(node, 'array');
				const symbol = this.getSymbol(arrayNode.text);
				return symbol ? symbol.type : 'unknown';
			}

			case 'CallExpression': {
				const calleeNode = findChildNamed(node, 'callee');
				const func = this.getFunction(calleeNode.text);
				return func ? (func.returnType ?? 'unknown') : 'unknown';
			}

			case 'CodeReference':
			case 'FunctionReference':
				return 'code';

			case 'NotExpression': {
				const inner = node.firstNamedChild;
				const innerType = this.resolveExpressionType(inner);
				if (innerType !== 'unknown' && innerType !== 'boolean') {
					this.emitNodeEvent('type_mismatch', 'boolean', innerType, `Operand of ${node.type}`);
				}
				return 'boolean';
			}

			case 'NegativeExpression':
			case 'PositiveExpression': {
				const inner = node.firstNamedChild;
				const innerType = this.resolveExpressionType(inner);
				if (!this.validateNumber(node, innerType, `Operand of ${node.type}`)) {
					return 'real';
				}
				return innerType;
			}

			case 'BinaryExpression': {
				const opNode = findChildNamed(node, 'operator');
				const lhsNode = findChildNamed(node, 'lhs');
				const rhsNode = findChildNamed(node, 'rhs');

				const op = opNode.text;
				const lhsType = this.resolveExpressionType(lhsNode);
				const rhsType = this.resolveExpressionType(rhsNode);

				if (op === 'and' || op === 'or') {
					this.validateBoolean(node, lhsType, `Left-hand-side operand for '${op}'`);
					this.validateBoolean(node, rhsType, `Right-hand-side operand for '${op}'`);
					return 'boolean';
				}

				if (op === '==' || op === '!=') {
					if (lhsType !== 'null' && rhsType !== 'null') {
						this.validateSameType(node, lhsType, rhsType, `Right-hand-side operand for '${op}'`);
					}
					return 'boolean';
				}

				if (op === '<' || op === '>' || op === '<=' || op === '>=') {
					if (this.validateNumber(node, lhsType, `Left-hand-side operand for '${op}'`) &&
						this.validateNumber(node, rhsType, `Right-hand-side operand for '${op}'`)) {
						this.validateSameType(node, lhsType, rhsType, `Right-hand-side operand for '${op}'`);
					}
					return 'boolean';
				}

				if (lhsType === 'unknown' && rhsType === 'unknown') {
					return 'unknown';
				}

				if (op === '+') {
					const lhsOk = this.validateNumberOrString(node, lhsType, `Left-hand-side operand for '${op}'`);
					const rhsOk = this.validateNumberOrString(node, rhsType, `Right-hand-side operand for '${op}'`);
					if (lhsOk && rhsOk) {
						this.validateSameType(node, lhsType, rhsType, `Right-hand-side operand for '${op}'`);
						if (lhsType !== 'unknown') return lhsType;
						if (rhsType !== 'unknown') return rhsType;
						return 'unknown';
					}
					if (!lhsOk && !rhsOk) {
						return 'unknown';
					}
					return lhsOk ? lhsType : rhsType;
				}

				if (op === '-' || op === '*' || op === '/') {
					const lhsOk = this.validateNumber(node, lhsType, `Left-hand-side operand for '${op}'`);
					const rhsOk = this.validateNumber(node, rhsType, `Right-hand-side operand for '${op}'`);
					if (lhsOk && rhsOk) {
						this.validateSameType(node, lhsType, rhsType, `Right-hand-side operand for '${op}'`);
						if (lhsType !== 'unknown') return lhsType;
						if (rhsType !== 'unknown') return rhsType;
						return 'unknown';
					}
					if (!lhsOk && !rhsOk) {
						return 'unknown';
					}
					return lhsOk ? lhsType : rhsType;
				}

				return 'unknown';
			}

			default:
				return 'unknown';
		}
	}

	matchResolvedExpressionType(expectedType, actualType) {
		// Avoid cascading errors.
		if (actualType === 'unknown') {
			return true;
		}

		// Null can be assigned to anything but boolean.
		if (actualType === 'null') {
			return expectedType !== 'boolean';
		}

		if (actualType === expectedType) {
			return true;
		}

		const actualTypeInfo = this.symbols.types.get(actualType);
		if (!actualTypeInfo) {
			// Reported elsewhere
			return true;
		}

		if (!this.symbols.types.has(actualType)) {
			return true;
		}

		if (actualTypeInfo.getExtends(expectedType)) {
			return true;
		}

		return actualType === expectedType;
	}

	getIsAlwaysTrue(node, t) {
		if (node.type === 'Literal' && node.text === 'true') return true;
		return false;
	}

	getIsAlwaysFalse(node) {
		if (node.type === 'Literal' && node.text === 'false') return true;
		return false;
	}

	getSymbol(bindName, fullyDefined = false) {
		if (!fullyDefined && this.symbols.currentLocal?.[0] === bindName) {
			return this.symbols.currentLocal[1];
		}
		if (this.symbols.local.has(bindName)) {
			return this.symbols.local.get(bindName);
		}
		if (this.symbols.global.has(bindName)) {
			return this.symbols.global.get(bindName);
		}
		return null;
	}

	getFunction(funcName) {
		if (!this.symbols.global.has(funcName)) {
			return null;
		}
		const func = this.symbols.global.get(funcName);
		if (func.type === 'code') {
			return func;
		}
		return null;
	}

	validateNodeType(node, expectedType, initializerNode, initializerDesc) {
		if (initializerNode.type === 'CodeReference') {
			if (expectedType !== 'code') {
				this.emitNodeEvent(node, 'type_mismatch', expectedType, 'code', initializerDesc);
				return false;
			}
			return true;
		}

		if (expectedType === 'real' && initializerNode.type === 'Literal' && initializerNode.text === '0') {
			// Integer 0 is IEEE 754 positive 0.0.
			// This is (ab)used in some Blizzard maps, such as Worm War.
			this.emitNodeEvent(node, 'type_punning', expectedType, '0', initializerDesc);
			return true;
		}

		const expressionType = this.resolveExpressionType(initializerNode);
		if (!this.matchResolvedExpressionType(expectedType, expressionType)) {
			this.emitNodeEvent(node, 'type_mismatch', expectedType, expressionType, initializerDesc);
			return false;
		} else if (expressionType === 'null' && isPrimitiveType(expectedType)) {
			this.emitNodeEvent(node, 'bad_null_assignment', expectedType, expressionType, initializerDesc);
			return true;
		}
		return true;
	}

	validateNumber(node, expressionType, initializerDesc) {
		if (expressionType !== 'unknown' && expressionType !== 'integer' && expressionType !== 'real') {
			this.emitNodeEvent(node, 'type_mismatch', 'integer | real', expressionType, initializerDesc);
			return false;
		}
		return true;
	}

	validateSameType(node, lhsType, rhsType, initializerDesc) {
		if (lhsType === 'unknown' || rhsType === 'unknown') {
			return true;
		}
		if (lhsType !== rhsType) {
			this.emitNodeEvent(node, 'type_mismatch', lhsType, rhsType, initializerDesc);
			return false;
		}
		return true;
	}

	validateNumberOrString(node, expressionType, initializerDesc) {
		if (expressionType !== 'unknown' && expressionType !== 'integer' && expressionType !== 'real' && expressionType !== 'string') {
			this.emitNodeEvent(node, 'type_mismatch', 'string | integer | real', expressionType, initializerDesc);
			return false;
		}
		return true;
	}

	validateBoolean(node, expressionType, initializerDesc) {
		if (expressionType !== 'unknown' && expressionType !== 'boolean') {
			this.emitNodeEvent(node, 'type_mismatch', 'boolean', expressionType, initializerDesc);
			return false;
		}
		return true;
	}

	handleNodeStart(node) {
		switch (node.type) {
			case 'TypeDeclaration': {
				const declName = findChildNamed(node, 'name').text;
				const superName = findChildNamed(node, 'super').text;
				if (this.symbols.types.has(declName)) {
					this.emitNodeEvent(node, 'shadowing', 'type', declName);
				}
				if (this.symbols.types.has(superName)) {
					this.registerType(node, declName, superName);
				}
				break;
			}
			case 'FunctionSignature': {
				const declName = findChildNamed(node, 'name').text;
				if (this.symbols.global.has(declName)) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'shadowing', 'global', declName);
				}
				this.registerFunction(node, declName)

				if (node.parent.type === 'FunctionDeclaration') {
					this.currentFunction = declName;

					const parameters = this.symbols.global.get(declName).parameters;
					for (const [declType, declName] of parameters) {
						if (this.symbols.local.has(declName)) {
							// Baseline PASS
							this.emitNodeEvent(node, 'shadowing', 'parameter', declName);
						}
						this.registerLocalVariableFromParameter(node.parent, declName, declType);
					}
					//assert.equal(this.symbols.local.size, parameters.length, `Local symbols at ${declName}: ${JSON.stringify(Array.from(this.symbols.local.keys()))}`);
				}

				break;
			}
			case 'GlobalDeclarationStatement': {
				const declName = findChildNamed(node, 'name').text;
				const declTypeNode = findChildNamed(node, 'type');
				const atomicType = declTypeNode.firstChild.text;
				const initializerNode = ensureKind(node.lastChild, 'Initializer');
				if (this.symbols.global.has(declName)) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'shadowing', 'global', declName);
				}
				if (isArrayType(declTypeNode) && this.symbols.types.get(atomicType)?.onlyAtomic) {
					this.emitNodeEvent(node, 'array_unsupported', atomicType);
				}
				this.registerGlobalVariable(node, declName, declTypeNode)

				if (initializerNode) {
					this.validateNodeType(node, atomicType, initializerNode, `Initializer value for '${declName}'`)
				}

				break;
			}
			case 'LocalDeclarationStatement': {
				const declName = findChildNamed(node, 'name').text;
				const declTypeNode = findChildNamed(node, 'type');
				const atomicType = declTypeNode.firstChild.text;
				const initializerNode = ensureKind(node.lastChild, 'Initializer');
				if (this.symbols.local.has(declName)) {
					// Baseline PASS
					this.emitNodeEvent(node, 'shadowing', 'local', declName);
				} else if (this.symbols.global.has(declName)) {
					// Baseline PASS
					this.emitNodeEvent(node, 'shadowing', 'global', declName);
				}
				if (isArrayType(declTypeNode) && this.symbols.types.get(atomicType)?.onlyAtomic) {
					this.emitNodeEvent(node, 'array_unsupported', atomicType);
				}
				this.prepareRegisterLocalVariable(node, declName, declTypeNode);

				if (initializerNode) {
					this.validateNodeType(node, atomicType, initializerNode, `Initializer value for '${declName}'`)
				}

				break;
			}
			case 'CallExpression': {
				const calleeName = findChildNamed(node, 'callee').text;
				const declaredSymbol = this.getFunction(calleeName);
				if (declaredSymbol) {
					const argumentsNode = ensureKind(node.lastNamedChild, 'FunctionArgumentList');
					if (argumentsNode === null) {
						if (declaredSymbol.parameters.length !== 0) {
							this.emitNodeEvent(node, 'call_bad_arity', calleeName, declaredSymbol.parameters.length, 0);
						}
					} else if (argumentsNode.namedChildCount !== declaredSymbol.parameters.length) {
						this.emitNodeEvent(node, 'call_bad_arity', calleeName, declaredSymbol.parameters.length, argumentsNode.namedChildCount);
					} else {
						const callArguments = argumentsNode.namedChildren;
						for (let i = 0; i < callArguments.length; i++) {
							assert.equal(callArguments[i].type, 'FunctionArgument', `${callArguments[i]} at ${node.text}`);
							const [expectedType, parameterName] = declaredSymbol.parameters[i];
							this.validateNodeType(node, expectedType, callArguments[i], `Parameter '${parameterName}' of ${calleeName}`);
						}
					}
					if ((declaredSymbol.returnType === null) !== (node.parent.type === 'CallStatement')) {
						if (declaredSymbol.returnType === null) {
							this.emitNodeEvent(node, 'void_call_as_expression', calleeName);
						} else {
							this.emitNodeEvent(node, 'return_value_discarded', calleeName);
						}
					}
					if (this.currentFunction === calleeName) {
						if (node.closest('LocalDeclarationStatement')) {
							// Baseline FAIL
							this.emitNodeEvent(node, 'recursive_function_local', calleeName);
						} else {
							this.emitNodeEvent(node, 'recursive_function', calleeName);
						}
					}
					if (!declaredSymbol.isConstant && this.getFunction(this.currentFunction)?.isConstant) {
						this.emitNodeEvent(node, 'const_function_violation', `const ${this.currentFunction}`, calleeName);
					}
					if (!this.currentFunction && isAPINeedsInitialization(calleeName)) {
						this.emitNodeEvent(node, 'api_too_early', calleeName);
					}
				}
				break;
			}
			case 'SetStatement': {
				const bindNode = findChildNamed(node, 'binding');
				const isArraySet = bindNode.type === 'ArrayElement';
				const bindName = isArraySet ? bindNode.firstChild.text : bindNode.text;
				const declaredSymbol = this.getSymbol(bindName);
				if (!declaredSymbol) {
					this.emitNodeEvent(node, 'binding_non_existent', bindName);
				} else if (declaredSymbol.isConstant) {
					this.emitNodeEvent(node, 'binding_constant', bindName);
				} else {
					this.validateNodeType(node, declaredSymbol.type, node.lastChild, `Value assigned to '${bindName}'`)
				}
				break;
			}

			case 'CodeReference': {
				const funcName = findChildNamed(node, 'funarg').text;
				const declaredSymbol = this.getFunction(funcName);
				if (declaredSymbol) {
					if (declaredSymbol.parameters.length > 0) {
						this.emitNodeEvent(node, 'funarg_not_nullary', funcName);
					} else if (declaredSymbol.isNative) {
						// Baseline PASS, but segfaults
						this.emitNodeEvent(node, 'funarg_native', funcName);
					} else if (declaredSymbol.returnType !== 'boolean' && findChildNamed(node.closest('CallExpression'), 'callee').text === 'Condition') {
						this.emitNodeEvent(node, 'condition_not_boolean', funcName);
					}
				}
				break;
			}

			case 'TypeReference': {
				if (!this.symbols.types.has(node.text)) {
					this.emitNodeEvent(node, 'type_missing', node.text);
				}
				break;
			}

			case 'FunctionReference': {
				const funcName = node.text;
				const declaredSymbol = this.getSymbol(funcName);
				if (!declaredSymbol) {
					this.emitNodeEvent(node, 'function_non_existent', funcName);
				} else if (declaredSymbol.type !== 'code') {
					this.emitNodeEvent(node, 'function_bad_type', funcName);
				}
				break;
			}

			case 'VariableReference': {
				// call _(var)
				// call _var[_])
				// set var = _
				// set var[_] = _
				// call _(_[var])
				// set _[var] = _
				const variableName = node.text;
				const isArrayAccess = node.parent.type === 'ArrayElement' && (node === node.parent.firstNamedChild);
				const declaredSymbol = this.getSymbol(variableName);
				if (!declaredSymbol) {
					this.emitNodeEvent(node, 'variable_non_existent', variableName);
				} else if (declaredSymbol.isTDZ) {
					if (this.getSymbol(variableName, true)) {
						// Baseline PASS - but it crashes the thread.
						this.emitNodeEvent(node, 'tdz_runtime_exception', variableName);
					} else {
						// Baseline FAIL
						this.emitNodeEvent(node, 'tdz_compile_exception', variableName);
					}
				} else if (declaredSymbol.isArray && !isArrayAccess) {
					this.emitNodeEvent(node, 'array_access_required', variableName);
				}
				break;
			}

			case 'ArrayElement': {
				const arrayName = findChildNamed(node, 'array').text;
				const indexNode = findChildNamed(node, 'index');
				const declaredSymbol = this.getSymbol(arrayName);
				if (declaredSymbol) {
					if (!declaredSymbol.isArray) {
						this.emitNodeEvent(node, 'array_access_incompatible', arrayName);
					} else if (this.validateNodeType(node, 'integer', indexNode, `Index for '${arrayName}'`)) {
						if (indexNode.type === 'Literal' && indexNode.text.startsWith('-')) {
							// Negative indices crash the engine.
							// Just check literals as low-hanging fruit.
							this.emitNodeEvent(node, 'array_access_off_bounds', arrayName);
						} else {
							// There are max index considerations as well,
							// but that depends on the language version, and needs a lot of testing.
						}
					}
				}
				break;
			}

			case 'RIfStatement':
			case 'LIfStatement': 
			case 'RElseIfStatement':
			case 'LElseIfStatement': {
				const condition = findChildNamed(node, 'test');
				if (this.getIsAlwaysTrue(condition)) {
					this.emitNodeEvent(node, 'constant_test', 'if', 'true');
				} else if (this.getIsAlwaysFalse(condition)) {
					this.emitNodeEvent(node, 'constant_test', 'if', 'false');
				}
				break;
			}

			case 'ExitWhenStatement': {
				const condition = node.lastNamedChild;
				if (this.getIsAlwaysTrue(condition, 'exitwhen')) {
					// NOTE: exitwhen true is JASS idiomatic break,
					const nextInstruction = getNextSignificantSibling(node);
					if (nextInstruction) {
						this.emitNodeEvent(node, 'unreachable_code', 'exitwhen', nextInstruction);
					}
				} else if (this.getIsAlwaysFalse(condition)) {
					this.emitNodeEvent(node, 'noop_code', 'exitwhen');
				}
				break;
			}

			case 'ReturnStatement': {
				const returnsSomething = node.namedChildCount > 0;
				const nextInstruction = getNextSignificantSibling(node);
				if (nextInstruction) {
					this.emitNodeEvent(node, 'unreachable_code', 'return', nextInstruction);
				}
				const expectedReturnType = this.getFunction(this.currentFunction)?.returnType;
				if (returnsSomething === (expectedReturnType === null)) {
					if (expectedReturnType === null) {
						this.emitNodeEvent(node, 'return_value_unexpected', 'return', nextInstruction);
					} else {
						this.emitNodeEvent(node, 'return_value_required', 'return', nextInstruction);
					}
				} else if (expectedReturnType !== null) {
					this.validateNodeType(node, expectedReturnType, node.firstNamedChild, `Return value from ${this.currentFunction}`);
				}
				break;
			}

			case 'BinaryExpression': {
				const op = findChildNamed(node, 'operator').text;

				if (op === '==' || op === '!=') {
					const lhsNode = findChildNamed(node, 'lhs');
					const rhsNode = findChildNamed(node, 'rhs');
					const lhsType = this.resolveExpressionType(lhsNode);
					const rhsType = this.resolveExpressionType(rhsNode);
					if (lhsType !== rhsType) {
						if (lhsType === 'null' && isPrimitiveType(rhsType)) {
							this.emitNodeEvent(node, 'bad_comparison', 'null vs primitive', rhsType);
						} else if (isPrimitiveType(lhsType) && rhsType === 'null') {
							this.emitNodeEvent(node, 'bad_comparison', 'null vs primitive', lhsType);
						}
					}
					if (lhsType === 'real' || rhsType === 'real') {
						this.emitNodeEvent(node, 'bad_comparison', 'real', rhsNode);
					}
				}

				break;
			}

			case 'OctalInteger': {
				const value = parseInt(node.text, 8);
				this.checkInt32Overflow(node, value);
				break;
			}

			case 'DecimalInteger': {
				const value = parseInt(node.text, 10);
				this.checkInt32Overflow(node, value);
				break;
			}

			case 'HexInteger': {
				const isNegative = node.text.charAt(0) === '-';
				let offset = (+isNegative);
				if (node.text.charAt(offset) === '0') {
					offset += 1;
				}
				const value = parseInt(node.text.slice(offset + 1), 16);
				this.checkInt32Overflow(node, value);
				break;
			}

			case 'Real': {
				this.checkFloat32Overflow(node, node.text);
				break;
			}

			case 'String': {
				this.checkStringSize(node, node.text);
				break;
			}
		}
		this.nodeCount = (this.nodeCount ? (this.nodeCount + 1) : 1);
	}

	handleNodeEnd(node) {
		switch (node.type) {
			case 'FunctionDeclaration': {
				this.resetLocalSymbols();
				break;
			}
			case 'LocalDeclarationStatement': {
				this.finishRegisterLocalVariable(this.symbols.currentLocal);
				this.symbols.currentLocal = null;
				break;
			}
		}
	}

	checkInt32Overflow(node, value) {
		if ((value | 0) !== value) {
			this.emitNodeEvent(node, 'int32_overflow', value);
		}
	}

	checkFloat32Overflow(node, literal) {
		let index = 0;
		let result = 0n;
		
		const INT32_MAX = 2147483647n;

		// integer part
		while (index < literal.length) {
			const char = literal[index++];
			if (char === '.') break;

			const digit = BigInt(char.charCodeAt(0) - 0x30);

			result = result * 10n + digit;
			if (result > INT32_MAX) {
				return false;
			}
		}

		// fractional part
		let frac = 0n;
		let pow10 = 1n;
		let nfrac = 0;
		let pow10Overflowed = false;

		while (index < literal.length) {
			const char = literal[index++];
			nfrac++;

			const digit = BigInt(char.charCodeAt(0) - 0x30);

			frac = frac * 10n + digit;
			if (frac > INT32_MAX) {
				return false;
			}

			if (!pow10Overflowed) {
				pow10 = pow10 * 10n;
				if (pow10 > INT32_MAX) {
					pow10Overflowed = true;
				}
			}

			if (pow10Overflowed) {
				if (frac !== 0n) {
					return false;
				}
				if (nfrac === 32) {
					return false;
				}
			}
		}
	}

	checkStringSize(node, literal) {
		if (literal.length >= 512) {
			this.emitNodeEvent(node, 'string_too_long', value);
		}
	}
	
	getOutput() {
		return {
			result: this.result,
			warnings: this.warnings || [],
			errors: this.errors || [],
		};
	}
}

module.exports = Validator;
