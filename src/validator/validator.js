"use strict";

const assert = require('assert/strict');
const path = require('path');
const util = require('util');
const EventEmitter = require('events');

const Parser = require('tree-sitter');
const JASS = require('tree-sitter-jass');

const {ValidatorResult} = require('./../../lib/constants');

const {
	TypeInfo,
	internalTypes, isNumberType, isPrimitiveType, isExtensibleType,
	isAPINeedsInitialization, isAPIHandleDestroyer, isAPINullUnsafe,
	isEntryPoint, entryPoints, isReservedKeyword,
} = require('./../language');

const {
	Set: {getAreDisjoint, addMany},
} = require('./../../lib/iterable-helpers');

const {
	extractParameters,
	extractReturnType,
	extractNthArgument,
	isFunctionArgument,
} = require('./../analysis/function');

const {
	isArrayTypeNode,
} = require('./../analysis/var-declaration');

const {
	extractValueNodeFromSetStatement,
	extractValueNodeFromDeclaration,
} = require('./../analysis/var-value');

const {
	isVariableReferenceAssignment,
} = require('./../analysis/var-reference');

const {
	findChildNamed,
	ensureKind,
	getPrevSignificantSibling,
	getNextSignificantSibling,
	getUnwrapParensDescendant,
	getUnwrapParensAncestor,
} = require('./../../lib/tree-helpers');

const ControlFlow = require('./../analysis/control-flow');

class Validator extends EventEmitter {
	constructor(options) {
		super()
		this.options = options;

		this.rules = this.options.rule || [];
		this.result = ValidatorResult.kOk;
		this.warnings = this.options.quiet ? null : [];
		this.errors = this.options.quiet ? null : [];
		this.deferred = [];
		this.runningDeferred = false;
		this.currentFile = '';
		this.currentTree = null;
		this.history = [];
		this.controlFlow = new ControlFlow(this);
		this.currentFunction = null;
		this.symbols = {
			types: this.getInternalTypes(),
			global: new Map(),
			local: new Map(),
			//currentFunction: '',
			currentLocal: null,
		};

		this.loadRules();
	}

	reset() {
		this.result = ValidatorResult.kOk;
		this.warnings = this.options.quiet ? null : [];
		this.errors = this.options.quiet ? null : [];
		this.deferred = [];
		this.runningDeferred = false;
		this.currentFile = '';
		this.currentTree = null;
		this.history = [];
		this.controlFlow = new ControlFlow();
		this.currentFunction = null;
		this.symbols = {
			types: this.getInternalTypes(),
			global: new Map(),
			local: new Map(),
			//currentFunction: '',
			currentLocal: null,
		};
	}

	warn(template, ...values) {
		this.warnings?.push(util.format(template, ...values));

		if (this.result !== ValidatorResult.kError) {
			this.result = ValidatorResult.kWarn;
		}
	}

	error(template, ...values) {
		this.errors?.push(util.format(template, ...values));

		if (this.result !== ValidatorResult.kError) {
			this.result = ValidatorResult.kError;
		}
	}

	loadRules() {
		if (!this.rules.length) {
			this.rules.push('core', 'sound', 'entry', 'recommended');
		}

		for (const ruleId of this.rules) {
			let rule;
			let rulePath = path.resolve(__dirname, 'rulesets', ruleId);
			try {
				require.resolve(rulePath);
			} catch (err) {
				if (err.code === 'MODULE_NOT_FOUND') {
					this.errors.push(util.format(`Rule %s not found.`, ruleId));
					continue;
				}
			}
			try {
				rule = require(rulePath);
				if (!rule || !rule.handlers || typeof rule.handlers !== 'object') {
					throw new Error(`${ruleId} does not implement the rule interface.`, ruleId);
				}
			} catch (err) {
				this.errors.push(util.format(`Rule %s is invalid. %s`, ruleId, err.stack));
				continue;
			}
			for (const eventName in rule.handlers) {
				this.on(eventName, rule.handlers[eventName]);
			}
		}
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

	deferEvent(...rest) {
		if (this.runningDeferred) return false;
		this.deferred.push([...rest]);
		return true;
	}

	runDeferred() {
		this.runningDeferred = true;
		for (const deferredEvent of this.deferred) {
			this.emit(deferredEvent[0], ...deferredEvent.slice(1));
		}
	}

	emitNodeEvent(node, eventName, ...rest) {
		const funcName = this.currentFunction?.name ?? '~';
		return this.emit(eventName, node, this.currentFile, funcName, ...rest);
	}

	emitSymbolEvent(symbol, eventName, ...rest) {
		const funcName = this.currentFunction?.name ?? '~';
		return this.emit(eventName, symbol.node, symbol.file, funcName, ...rest);
	}

	getInternalTypes() {
		return new Map(internalTypes.map(name => [name, new TypeInfo(name, null, name === 'code')]));
	}

	exitFunction() {
		this.currentFunction = null;
		this.resetLocalSymbols();
	}

	resetLocalSymbols() {
		this.symbols.local.clear();
	}

	checkTreeInner(filePath, cst) {
		this.currentFile = filePath;
		this.currentTree = cst;

		this.history.push([{
			// Ensure past trees aren't deallocated
			file: this.currentFile,
			tree: this.currentTree,
		}]);

		if (!this.currentTree.rootNode) {
			console.trace(`currentTree has no root WTF: `, this.currentTree);
		}
		const cursor = this.currentTree.rootNode.walk();
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

	checkTree(filePath, cst) {
		const hold = {cst};
		this.checkTreeInner(filePath, hold.cst);
		this.checkFullProgramEnd();
		this.runDeferred();
		this.emit('end');

		const out = this.getOutput();
		this.reset();
		return out;
	}

	checkTrees(trees) {
		for (const [filePath, cst] of trees) {
			this.checkTreeInner(filePath, cst);
		}
		this.checkFullProgramEnd();
		this.runDeferred();
		this.emit('end');

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
		const symbol = {
			name: symbolName,
			node: node,
			type: 'code',
			parameters: extractParameters(findChildNamed(node, 'input')),
			returnType: extractReturnType(findChildNamed(node, 'output')),
			isConstant,
			hasGlobalSet: false,
			hasNonConstantCalls: false,
			isParameter: false,
			isTDZ: false,
			isNative,
			isGlobal: true,
			isUsed: isEntryPoint(symbolName),
			isReassigned: false,
			isNulled: {
				initial: false,
				deferred: false,
			},
			hasInitialValue: true,
			isSyntacticFunction: true,
			file: this.currentFile,
		};
		this.symbols.global.set(symbolName, symbol);
		return symbol;
	}

	registerGlobalVariable(node /* GlobalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayTypeNode(typeNode);
		const isConstant = !isArray && node.firstChild.type === 'ConstantAttribute';
		const initialValueNode = extractValueNodeFromDeclaration(node);
		this.symbols.global.set(symbolName, {
			name: symbolName,
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: isConstant,
			isParameter: false,
			isTDZ: false, // TODO: TDZ for globals
			isNative: false,
			isGlobal: true,
			isUsed: false,
			isReassigned: false,
			isNulled: {
				initial: initialValueNode?.text === 'null',
				deferred: false,
			},
			hasInitialValue: initialValueNode !== null,
			isSyntacticFunction: false,
			file: this.currentFile,
		});
	}

	registerLocalVariable(node /* LocalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayTypeNode(typeNode);
		const isConstant = !isArray && node.firstChild.type === 'ConstantAttribute';
		const initialValueNode = extractValueNodeFromDeclaration(node);
		this.symbols.local.set(symbolName, {
			name: symbolName,
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: isConstant,
			isParameter: false,
			isTDZ: false,
			isNative: false,
			isGlobal: false,
			isUsed: false,
			isReassigned: false,
			isNulled: {
				initial: initialValueNode?.text === 'null',
				deferred: false,
			},
			hasInitialValue: initialValueNode !== null,
			isSyntacticFunction: false,
			file: this.currentFile,
		});
	}

	prepareRegisterLocalVariable(node /* LocalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayTypeNode(typeNode);
		const isConstant = !isArray && node.firstChild.type === 'ConstantAttribute';
		const initialValueNode = extractValueNodeFromDeclaration(node);
		this.symbols.currentLocal = [symbolName, {
			name: symbolName,
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: isConstant,
			isParameter: false,
			isTDZ: !isArray,
			isNative: false,
			isGlobal: false,
			isUsed: false,
			isReassigned: false,
			isNulled: {
				initial: initialValueNode?.text === 'null',
				deferred: false,
			},
			hasInitialValue: initialValueNode !== null,
			isSyntacticFunction: false,
			file: this.currentFile,
		}];
	}

	finishRegisterLocalVariable(currentLocal) {
		currentLocal[1].isTDZ = false;
		this.symbols.local.set(currentLocal[0], currentLocal[1]);
	}

	registerLocalVariableFromParameter(node /* FunctionDeclaration */, symbolName, declType) {
		this.symbols.local.set(symbolName, {
			name: symbolName,
			node: node,
			type: declType,
			isArray: false,
			isConstant: false,
			isParameter: true,
			isTDZ: false,
			isNative: false,
			isGlobal: false,
			isUsed: false,
			isReassigned: false,
			isNulled: {
				initial: false,
				deferred: false,
			},
			hasInitialValue: true,
			isSyntacticFunction: false,
			file: this.currentFile,
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
				const symbol = this.getNonTypeSymbol(node.text);
				return symbol ? symbol.type : 'unknown';
			}

			case 'ArrayElement': {
				const arrayNode = findChildNamed(node, 'array');
				const symbol = this.getNonTypeSymbol(arrayNode.text);
				return symbol ? symbol.type : 'unknown';
			}

			case 'CallExpression': {
				const calleeNode = findChildNamed(node, 'callee');
				const func = this.getFunction(calleeNode.text);
				return func ? (func.returnType || 'unknown') : 'unknown';
			}

			case 'CodeReference':
			case 'FunctionReference':
				return 'code';

			case 'NotExpression': {
				const inner = node.firstNamedChild;
				const innerType = this.resolveExpressionType(inner);
				if (innerType !== 'unknown' && innerType !== 'boolean') {
					this.emitNodeEvent(node, 'type_mismatch', 'boolean', innerType, `Operand of ${node.type}`);
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
					if (lhsType !== 'null' && rhsType !== 'null' && !(isNumberType(lhsType) && isNumberType(rhsType))) {
						this.validateSameType(node, lhsType, rhsType, `Right-hand-side operand for '${op}'`);
					}
					return 'boolean';
				}

				if (op === '<' || op === '>' || op === '<=' || op === '>=') {
					/*
					if (this.validateNumber(node, lhsType, `Left-hand-side operand for '${op}'`) &&
						this.validateNumber(node, rhsType, `Right-hand-side operand for '${op}'`)) {
						this.validateSameType(node, lhsType, rhsType, `Right-hand-side operand for '${op}'`);
					}*/
					this.validateNumber(node, lhsType, `Left-hand-side operand for '${op}'`);
					this.validateNumber(node, rhsType, `Right-hand-side operand for '${op}'`);
					return 'boolean';
				}

				if (lhsType === 'unknown' && rhsType === 'unknown') {
					return 'unknown';
				}

				if (op === '+') {
					const lhsOk = this.validateNumberOrString(node, lhsType, `Left-hand-side operand for '${op}'`);
					const rhsOk = this.validateNumberOrString(node, rhsType, `Right-hand-side operand for '${op}'`);
					if (!lhsOk || !rhsOk) {
						return 'unknown';
					}
					if (lhsType === rhsType) {
						return lhsType;
					}
					if (lhsType === 'string') {
						this.validateSameType(node, lhsType, rhsType, `Right-hand-side operand for '${op}'`);
						return 'unknown';
					} else if (rhsType === 'string') {
						this.validateSameType(node, rhsType, lhsType, `Left-hand-side operand for '${op}'`);
						return 'unknown';
					} else {
						return 'real';
					}
				}

				if (op === '-' || op === '*' || op === '/') {
					const lhsOk = this.validateNumber(node, lhsType, `Left-hand-side operand for '${op}'`);
					const rhsOk = this.validateNumber(node, rhsType, `Right-hand-side operand for '${op}'`);
					if (!lhsOk || !rhsOk) {
						return lhsOk ? lhsType : (rhsOk ? rhsType : 'unknown');
					}
					if (lhsType === rhsType) {
						return lhsType;
					}
					return 'real';
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

		if (isNumberType(expectedType) && isNumberType(actualType)) {
			return true;
		}

		return false;
	}

	getTrivialTestValue(node) {
		if (node.type === 'ParenthesizedExpression') {
			return this.getTrivialTestValue(node);
		}
		if (node.type !== 'Literal') return null;
		if (node.text === 'true') return true;
		if (node.text === 'false') return false;
		return null;
	}

	getTrivialNumberValue(expressionType, node) {
		if (node.type === 'ParenthesizedExpression' || node.type === 'Literal' || node.type === 'FunctionArgument') {
			return this.getTrivialNumberValue(expressionType, node.firstNamedChild);
		}

		if (node.type === 'NegativeExpression') {
			const innerResult = this.getTrivialNumberValue(expressionType, node.firstNamedChild);
			if (innerResult === null) return null;
			return -innerResult;
		}

		switch (node.type) {
			case 'OctalInteger': {
				const value = parseInt(node.text, 8);
				return value;
			}

			case 'DecimalInteger': {
				const value = parseInt(node.text, 10);
				return value;
			}

			case 'HexInteger': {
				const isNegative = node.text.charAt(0) === '-';
				let offset = (+isNegative);
				if (node.text.charAt(offset) === '0') {
					offset += 1;
				}
				const value = parseInt(node.text.slice(offset + 1), 16);
				return value;
			}

			case 'Real': {
				return Number(node.text);
			}

			default:
				return null;
		}

		return null;
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
		if (this.symbols.types.has(bindName)) {
			return this.symbols.types.get(bindName);
		}
		return null;
	}

	getNonTypeSymbol(bindName, fullyDefined = false) {
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

	getIsAnyNonLocal(variableList) {
		for (const varName of variableList) {
			if (!this.symbols.local.has(varName)) {
				const commaIndex = varName.indexOf(',');
				if (commaIndex < 0) return true;
				if (!this.symbols.local.has(varName.slice(0, commaIndex))) {
					return true;
				}
			}
		}
	}

	validateNodeType(node, expectedType, initializerNode, initializerDesc) {
		if (initializerNode.type === 'CodeReference') {
			if (expectedType !== 'code') {
				this.emitNodeEvent(node, 'type_mismatch', expectedType, 'code', initializerDesc);
				return false;
			}
			return true;
		}

		const expressionType = this.resolveExpressionType(initializerNode);
		if (!this.matchResolvedExpressionType(expectedType, expressionType)) {
			this.emitNodeEvent(node, 'type_mismatch', expectedType, expressionType, initializerDesc);
			return false;
		}
		if (expressionType === expectedType) {
			return true;
		}
		if (expressionType === 'null' && isPrimitiveType(expectedType)) {
			// Baseline PASS
			this.emitNodeEvent(node, 'bad_null_assignment', expectedType, expressionType, initializerDesc);
			return true;
		}
		if (node.type === 'ReturnStatement') {
			if (isNumberType(expressionType) && isNumberType(expectedType)) {
				const value = this.getTrivialNumberValue(expressionType, initializerNode);
				if (value !== null && (value === 0 || value === +0.)) {
					// Integer 0 is IEEE 754 positive 0.0.
					// This is (ab)used in some Blizzard maps, such as Worm War.
					// Baseline PASS
					this.emitNodeEvent(node, 'number_type_punning', expectedType, expressionType, value, initializerDesc);
				} else {
					// Baseline PASS
					this.emitNodeEvent(node, 'number_type_reinterpret', expectedType, expressionType, initializerNode.text, initializerDesc);
				}
				return true;
			}
		} else if (expressionType === 'real' && expectedType == 'integer') {
			// Baseline FAIL
			this.emitNodeEvent(node, 'type_mismatch', expectedType, expressionType, initializerDesc);
			return false;
		} else if (expressionType === 'integer' && expectedType === 'real') {
			const value = this.getTrivialNumberValue(expressionType, initializerNode);
			if (value === null) {
				// Baseline PASS
				this.emitNodeEvent(node, 'lossy_type_cast', expectedType, expressionType, 'unknown', initializerNode.text, initializerDesc);
				return false;
			} else if (value > 0x1_000_000 || value < -0x1_000_000) {
				// Baseline PASS
				this.emitNodeEvent(node, 'lossy_type_cast', expectedType, expressionType, 'resolved', value, initializerDesc);
				return false;
			}
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
					// Baseline FAIL
					this.emitNodeEvent(node, 'shadowing', 'type', 'global', 'global', declName);
				}
				if (this.symbols.types.has(superName)) {
					if (!isExtensibleType(superName)) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'non_extensible', declName, superName);
					} else {
						this.registerType(node, declName, superName);
					}
				}
				break;
			}
			case 'FunctionSignature': {
				const declName = findChildNamed(node, 'name').text;
				const beforeSymbol = this.getSymbol(declName);
				if (beforeSymbol) {
					if (beforeSymbol.isType) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'unexpected_type', declName, 'function');
					} else {
						// Baseline FAIL
						this.emitNodeEvent(node, 'shadowing', 'function', 'global', 'global', declName);
					}
				}
				if (isReservedKeyword(declName)) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'reserved_word', declName);
				}
				const symbol = this.registerFunction(node, declName)
				this.currentFunction = symbol;

				if (symbol.isConstant && !symbol.returnType && !symbol.isNative) {
					// Baseline PASS
					this.emitNodeEvent(node, 'void_constant_function', declName);
				}

				if (symbol.parameters.length >= 32) {
					this.emitNodeEvent(node, 'too_many_parameters', declName, symbol.parameters.length, 32);
				}

				if (node.parent.type === 'FunctionDeclaration') {
					for (const [declType, declName] of symbol.parameters) {
						if (this.symbols.local.has(declName)) {
							// Baseline PASS
							this.emitNodeEvent(node, 'shadowing', 'parameter', 'local', 'local', declName);
						} else if (this.symbols.global.has(declName)) {
							// Baseline PASS
							this.emitNodeEvent(node, 'shadowing', 'parameter', 'global', 'local', declName);
						}
						this.registerLocalVariableFromParameter(node.parent, declName, declType);
					}
				}

				break;
			}
			case 'GlobalDeclarationStatement': {
				const declName = findChildNamed(node, 'name').text;
				const declTypeNode = findChildNamed(node, 'type');
				const atomicType = declTypeNode.firstChild.text;
				const initializerNode = ensureKind(node.lastChild, 'Initializer');

				const beforeSymbol = this.getSymbol(declName);
				if (beforeSymbol) {
					if (beforeSymbol.isType) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'unexpected_type', declName, 'variable');
					} else {
						// Baseline FAIL
						this.emitNodeEvent(node, 'shadowing', 'variable', 'global', 'global', declName);
					}
				}
				if (isArrayTypeNode(declTypeNode) && this.symbols.types.get(atomicType)?.onlyAtomic) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'array_unsupported', atomicType);
				}
				if (isReservedKeyword(declName)) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'reserved_word', declName);
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
				const beforeSymbol = this.getSymbol(declName, true);
				if (beforeSymbol) {
					if (beforeSymbol.isType) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'unexpected_type', declName, 'variable');
					} else if (beforeSymbol.isGlobal) {
						// Baseline PASS
						this.emitNodeEvent(node, 'shadowing', 'variable', 'global', 'local', declName);
					} else {
						// Baseline PASS
						this.emitNodeEvent(node, 'shadowing', 'variable', 'local', 'local', declName);
					}
				}
				if (isArrayTypeNode(declTypeNode) && this.symbols.types.get(atomicType)?.onlyAtomic) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'array_unsupported', atomicType);
				}
				if (isReservedKeyword(declName)) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'reserved_word', declName);
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
							// Baseline FAIL
							this.emitNodeEvent(node, 'call_bad_arity', 'eager', calleeName, declaredSymbol.parameters.length, 0);
						}
					} else if (argumentsNode.namedChildCount !== declaredSymbol.parameters.length) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'call_bad_arity', 'eager', calleeName, declaredSymbol.parameters.length, argumentsNode.namedChildCount);
					} else {
						const callArguments = argumentsNode.namedChildren;
						for (let i = 0; i < callArguments.length; i++) {
							assert.equal(callArguments[i].type, 'FunctionArgument', `${callArguments[i]} at ${node.text}`);
							const [expectedType, parameterName] = declaredSymbol.parameters[i];
							this.validateNodeType(node, expectedType, callArguments[i], `Parameter '${parameterName}' of ${calleeName}`);
						}
					}
					if ((!declaredSymbol.returnType) !== (node.parent.type === 'CallStatement')) {
						if (!declaredSymbol.returnType) {
							// Baseline FAIL
							this.emitNodeEvent(node, 'void_call_as_expression', calleeName);
						} else {
							// Baseline PASS
							this.emitNodeEvent(node, 'return_value_discarded', 'eager', calleeName, declaredSymbol.returnType);
						}
					}
					if (this.currentFunction?.name === calleeName) {
						if (node.closest('LocalDeclarationStatement')) {
							// Baseline FAIL
							this.emitNodeEvent(node, 'recursive_function_local', calleeName);
						} else {
							// Baseline PASS
							this.emitNodeEvent(node, 'recursive_function', calleeName);
						}
					}
					if (!declaredSymbol.isConstant && this.currentFunction) {
						this.currentFunction.hasNonConstantCalls = true;

						if (this.currentFunction.isConstant) {
							// Baseline FAIL
							this.emitNodeEvent(node, 'const_function_violation', 'call', `const ${this.currentFunction.name}`, calleeName);
						}
					}
					if (!this.currentFunction && isAPINeedsInitialization(calleeName)) {
						// Baseline PASS
						this.emitNodeEvent(node, 'api_too_early', calleeName);
					}

					if (calleeName === 'ExecuteFunc' && argumentsNode && argumentsNode.namedChildCount === 1) {
						const subCalleeNode = argumentsNode.namedChildren[0].namedChildren[0];
						if (subCalleeNode.type === 'Literal' && subCalleeNode.namedChildren[0].type === 'String') {
							const subCalleeName = subCalleeNode.namedChildren[0].text.slice(1, -1);
							const subCalleeSymbol = this.getFunction(subCalleeName);
							if (!subCalleeSymbol || subCalleeSymbol.type !== 'code') {
								// Baseline PASS
								this.emitNodeEvent(node, 'function_non_existent', 'deferred', subCalleeName);
							} else {
								if (subCalleeSymbol.parameters.length > 0) {
									// Baseline PASS
									this.emitNodeEvent(node, 'call_bad_arity', 'deferred', subCalleeName, subCalleeSymbol.parameters.length, 0);
								}
								if (subCalleeSymbol.returnType) {
									// Baseline PASS
									this.emitNodeEvent(node, 'return_value_discarded', 'deferred', subCalleeName, subCalleeSymbol.returnType);
								}
								subCalleeSymbol.isUsed = true;
							}
						}
					}
				}
				break;
			}
			case 'CallStatement': {
				const callExpressionNode = node.lastNamedChild;
				const calleeName = findChildNamed(callExpressionNode, 'callee').text;
				const declaredSymbol = this.getFunction(calleeName);
				if (declaredSymbol) {
					if (isAPIHandleDestroyer(calleeName)) {
						const argumentsNode = ensureKind(callExpressionNode.lastNamedChild, 'FunctionArgumentList');
						const subCalleeNode = argumentsNode ? extractNthArgument(argumentsNode, 0) : null;
						if (subCalleeNode && (subCalleeNode.type === 'VariableReference' || subCalleeNode.type === 'ArrayElement')) {
							const symbolName = subCalleeNode.type === 'VariableReference' ? subCalleeNode.text : subCalleeNode.firstNamedChild.text;
							const symbolInfo = this.getNonTypeSymbol(symbolName);
							if (symbolInfo?.isGlobal) {
								const nextInstruction = getNextSignificantSibling(node);
								if (!nextInstruction ||
									nextInstruction.type !== 'SetStatement' ||
									nextInstruction.firstNamedChild.type !== subCalleeNode.type ||
									nextInstruction.firstNamedChild.text !== subCalleeNode.text
								) {
									// Baseline PASS
									this.emitNodeEvent(node, 'dangling_global_handle', subCalleeNode.text, symbolInfo.type, nextInstruction);
								}
							}
						}
					}
					if (isAPINullUnsafe(calleeName)) {
						const argumentsNode = ensureKind(callExpressionNode.lastNamedChild, 'FunctionArgumentList');
						const subCalleeNode = argumentsNode ? extractNthArgument(argumentsNode, 0) : null;
						if (subCalleeNode && subCalleeNode.type === 'VariableReference') {
							const symbolName = subCalleeNode.text;
							const symbolInfo = this.getNonTypeSymbol(symbolName);
							if (symbolInfo?.isNulled?.deferred) {
								// Baseline PASS
								this.emitNodeEvent(node, 'api_receiver_unsafe_null', calleeName, symbolName, symbolInfo.type);
							}
						}
					}
				}
				break;
			}

			case 'SetStatement': {
				const bindNode = findChildNamed(node, 'binding');
				const isArraySet = bindNode.type === 'ArrayElement';
				const bindName = isArraySet ? bindNode.firstChild.text : bindNode.text;
				const declaredSymbol = this.getNonTypeSymbol(bindName);
				/*
				if (!declaredSymbol) 
					// Baseline FAIL
					this.emitNodeEvent(node, 'binding_non_existent', bindName);
				}
				*/
				if (declaredSymbol) {
					if (declaredSymbol.isConstant) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'binding_constant', bindName);
					} else {
						declaredSymbol.isReassigned = true;
						this.validateNodeType(node, declaredSymbol.type, node.lastChild, `Value assigned to '${bindName}'`)
						if (declaredSymbol.isGlobal && extractValueNodeFromSetStatement(node).text === 'null') {
							declaredSymbol.isNulled.deferred = true;
						}
					}
					if (declaredSymbol.isGlobal) {
						this.currentFunction.hasGlobalSet = true;
						if (this.currentFunction.isConstant) {
							this.emitNodeEvent(node, 'const_function_violation', 'set', `const ${this.currentFunction.name}`, bindName);
						}
					}
				}
				break;
			}

			case 'CodeReference': {
				const funcName = findChildNamed(node, 'funarg').text;
				const declaredSymbol = this.getFunction(funcName);
				if (declaredSymbol) {
					if (declaredSymbol.parameters.length > 0) {
						// Baseline PASS, but (untested) apparently it desyncs in old versions or something
						this.emitNodeEvent(node, 'funarg_not_nullary', funcName);
					} else if (declaredSymbol.isNative) {
						// Baseline PASS, but segfaults
						this.emitNodeEvent(node, 'funarg_native', funcName);
					} else if (declaredSymbol.returnType !== 'boolean') {
						const higherOrderName = findChildNamed(node.closest('CallExpression'), 'callee').text;
						if (higherOrderName === 'Condition' || higherOrderName === 'Filter') {
							// Baseline PASS
							this.emitNodeEvent(node, 'higher_order_type_mismatch', 'boolean', declaredSymbol.returnType || 'nothing', higherOrderName, funcName);
						}
					}
				}
				break;
			}

			case 'TypeReference': {
				if (!this.symbols.types.has(node.text)) {
					// Baseline PASS
					this.emitNodeEvent(node, 'type_missing', node.text);
				}
				break;
			}

			case 'FunctionReference': {
				const funcName = node.text;
				const declaredSymbol = this.getSymbol(funcName);
				if (!declaredSymbol) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'function_non_existent', 'eager', funcName);
				} else if (declaredSymbol.isType) {
					this.emitNodeEvent(node, 'unexpected_type', funcName, 'function');
				} else if (declaredSymbol.type !== 'code') {
					this.emitNodeEvent(node, 'function_bad_type', funcName);
				} else {
					declaredSymbol.isUsed = true;
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
				this.controlFlow.enter(node);
				const variableName = node.text;
				const isArrayAccess = node.parent.type === 'ArrayElement' && (node === node.parent.firstNamedChild);
				const isAssignment = isVariableReferenceAssignment(node);
				const declaredSymbol = this.getSymbol(variableName);
				if (!declaredSymbol) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'variable_non_existent', variableName);
				} else if (declaredSymbol.isType) {
					this.emitNodeEvent(node, 'unexpected_type', variableName, 'variable');
				} else if (declaredSymbol.isTDZ) {
					if (this.getSymbol(variableName, true)) {
						// Baseline PASS - but it crashes the thread.
						this.emitNodeEvent(node, 'tdz_exception', 'deferred', variableName);
					} else {
						// Baseline FAIL
						this.emitNodeEvent(node, 'tdz_exception', 'eager', variableName);
					}
				} else if (declaredSymbol.isArray && !isArrayAccess) {
					// Baseline FAIL
					if (isAssignment) {
						this.emitNodeEvent(node, 'array_access_required', 'write', variableName);
					} else {
						this.emitNodeEvent(node, 'array_access_required', 'read', variableName);
					}
				}
				if (declaredSymbol && !isAssignment) {
					declaredSymbol.isUsed = true;
				}
				break;
			}

			case 'ArrayElement': {
				this.controlFlow.enter(node);
				const arrayName = findChildNamed(node, 'array').text;
				const indexNode = findChildNamed(node, 'index');
				const declaredSymbol = this.getSymbol(arrayName);
				if (declaredSymbol) {
					if (declaredSymbol.isType) {
						this.emitNodeEvent(node, 'unexpected_type', variableName, 'variable');
					} else if (!declaredSymbol.isArray) {
						// Baseline FAIL
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

			case 'FunctionBody': {
				this.controlFlow.enter(node);
				break;
			}

			case 'LoopStatement': {
				this.controlFlow.enter(node);
				break;
			}

			case 'RIfStatement':
			case 'LIfStatement': 
			case 'RConsequent':
			case 'LConsequent':
			case 'RAlternate':
			case 'LAlternate': {
				this.controlFlow.enter(node);
				break;
			}

			case 'Test': {
				this.controlFlow.enter(node);
				const trivialValue = this.getTrivialTestValue(node);
				if (trivialValue !== null) {
					if (node.parent.type === 'ExitWhenStatement') {
						if (trivialValue) {
							// NOTE: exitwhen true is the only "break" in JASS.
							const nextInstruction = getNextSignificantSibling(node.parent);
							if (nextInstruction) {
								// Baseline PASS
								this.emitNodeEvent(nextInstruction, 'unreachable_code', 'exitwhen', node);
							}
						} else {
							// Baseline PASS
							this.emitNodeEvent(node, 'noop_code', 'exitwhen');
						}
					} else {
						// Baseline PASS
						this.emitNodeEvent(node, 'constant_test', 'if', trivialValue);
					}
				}
				break;
			}

			case 'ExitWhenStatement': {
				this.controlFlow.enter(node);
				break;
			}

			case 'ReturnStatement': {
				this.controlFlow.enter(node);
				const returnsSomething = node.namedChildCount > 0;
				const expectedReturnType = this.currentFunction.returnType;
				if (returnsSomething === !expectedReturnType) {
					if (!expectedReturnType) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'return_value_unexpected', node.firstNamedChild);
					} else {
						// Baseline FAIL
						this.emitNodeEvent(node, 'return_value_required', expectedReturnType);
					}
				} else if (expectedReturnType) {
					this.validateNodeType(node, expectedReturnType, node.firstNamedChild, `Return value from ${this.currentFunction.name}`);
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
							// Baseline PASS
							this.emitNodeEvent(node, 'bad_comparison', 'null vs primitive', rhsType);
						} else if (isPrimitiveType(lhsType) && rhsType === 'null') {
							// Baseline PASS
							this.emitNodeEvent(node, 'bad_comparison', 'null vs primitive', lhsType);
						}
					}
					if ((lhsType === 'real' && lhsNode.type === 'Literal') || (rhsType === 'real' && rhsNode.type === 'Literal')) {
						// Baseline PASS
						this.emitNodeEvent(node, 'bad_comparison', 'real_literal', !(lhsType === 'real' && lhsNode.type === 'Literal') ? lhsType : rhsType);
					} else if (lhsType === 'real' || rhsType === 'real') {
						// Baseline PASS
						this.emitNodeEvent(node, 'bad_comparison', 'real', lhsType !== 'real' ? lhsType : rhsType);
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
				this.checkFunctionEnd(node);
				this.exitFunction();
				break;
			}

			case 'FunctionSignature': {
				if (node.parent.type !== 'FunctionDeclaration') {
					this.exitFunction();
				}
				break;
			}

			case 'VariableReference':
			case 'ArrayElement': {
				this.controlFlow.leave(node);
				break;
			}

			case 'LocalDeclarationStatement': {
				this.finishRegisterLocalVariable(this.symbols.currentLocal);
				this.symbols.currentLocal = null;
				break;
			}

			case 'LoopStatement': {
				this.controlFlow.leave(node);
				break;
			}

			case 'RIfStatement':
			case 'LIfStatement': 
			case 'RConsequent':
			case 'LConsequent':
			case 'RAlternate':
			case 'LAlternate': {
				this.controlFlow.leave(node);
				break;
			}

			case 'ReturnStatement': {
				this.controlFlow.leave(node);
				break;
			}
			case 'ExitWhenStatement': {
				this.controlFlow.leave(node);
				break;
			}

			case 'Test': {
				this.controlFlow.leave(node);
				break;
			}

			case 'FunctionBody': {
				this.controlFlow.leave(node);
				break;
			}
		}
	}

	checkInt32Overflow(node, value) {
		if ((value | 0) !== value) {
			// Baseline PASS
			this.emitNodeEvent(node, 'int32_overflow', value);
		}
	}

	checkFloat32Overflow(node, literal) {
		// TODO: float32_overflow
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
				this.emitNodeEvent(node, 'float32_overflow', +literal, literal);
				return;
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
				this.emitNodeEvent(node, 'float32_overflow', +literal, literal);
				return;
			}

			if (!pow10Overflowed) {
				pow10 = pow10 * 10n;
				if (pow10 > INT32_MAX) {
					pow10Overflowed = true;
				}
			}

			if (pow10Overflowed) {
				if (frac !== 0n || nfrac === 32) {
					this.emitNodeEvent(node, 'float32_overflow', +literal, literal);
					return;
				}
			}
		}
	}

	checkStringSize(node, literal) {
		if (Buffer.byteLength(literal) >= 1026) { /* counts quotes */
			// Baseline PASS
			this.emitNodeEvent(node, 'string_too_long', literal);
		}
	}

	checkFunctionEnd(node) {
		if (!this.currentFunction.isConstant && !this.currentFunction.hasGlobalSet && !this.currentFunction.hasNonConstantCalls) {
			this.emitNodeEvent(node, 'prefer_constant_function', this.currentFunction.name);
		}

		for (const [symbolName, symbolInfo] of this.symbols.local) {
			if (!symbolInfo.isUsed) {
				if (symbolInfo.isParameter) {
					// Baseline PASS
					this.emitSymbolEvent(symbolInfo, 'unused_parameter', symbolName);
				} else {
					// Baseline PASS
					this.emitSymbolEvent(symbolInfo, 'unused_local_variable', symbolName);
				}
			}
			if (!symbolInfo.isReassigned && !symbolInfo.hasInitialValue && !symbolInfo.isArray) {
				this.emitSymbolEvent(symbolInfo, 'never_initialized_local', symbolName, symbolInfo.type);
			}
		}
	}

	checkFullProgramEnd() {
		for (const [symbolName, symbolInfo] of this.symbols.global) {
			if (!symbolInfo.isConstant && !symbolInfo.isArray && !symbolInfo.isReassigned && !symbolInfo.isSyntacticFunction) {
				this.emitNodeEvent(symbolInfo.node, 'prefer_constant_variable', symbolName, symbolInfo.type);
			}

			if (!symbolInfo.isUsed) {
				if (symbolInfo.isSyntacticFunction) {
					// Baseline PASS
					this.emitSymbolEvent(symbolInfo, 'unused_function', symbolName);
				} else {
					// Baseline PASS
					this.emitSymbolEvent(symbolInfo, 'unused_global_variable', symbolName);
				}
			}

			if (!symbolInfo.isReassigned && !symbolInfo.hasInitialValue && !symbolInfo.isArray) {
				this.emitSymbolEvent(symbolInfo, 'never_initialized_global', symbolName, symbolInfo.type);
			}
		}

		for (const symbolName of entryPoints) {
			const symbolInfo = this.symbols.global.get(symbolName);
			if (!symbolInfo) {
				this.emit('entrypoint_missing', null, null, '~', symbolName);
			} else if (!symbolInfo.isSyntacticFunction) {
				this.emitSymbolEvent(symbolInfo, 'entrypoint_nonfunction', symbolName);
			} else if (symbolInfo.isConstant) {
				this.emitSymbolEvent(symbolInfo, 'entrypoint_constant', symbolName);
			} else if (symbolInfo.returnType) {
				this.emitSymbolEvent(symbolInfo, 'entrypoint_returns', symbolName);
			} else if (symbolInfo.parameters.length) {
				this.emitSymbolEvent(symbolInfo, 'entrypoint_parameters', symbolName);
			}
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
