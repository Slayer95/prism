"use strict";

const assert = require('assert/strict');
const path = require('path');
const util = require('util');
const EventEmitter = require('events');

const Parser = require('tree-sitter');
const JASS = require('tree-sitter-jass');

const {ValidatorResult} = require('./../../lib/constants');
const {internalTypes, isNumberType, isPrimitiveType, isAPINeedsInitialization, isAPIHandleDestroyer} = require('./../../lib');

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
		node = node.nextNamedSibling;
	}

	return node || null;
}

function getPrevExitWhen(node) {
	do {
		node = node.prevNamedSibling;
	} while (node && node.type === 'ExitWhenStatement');

	return node || null;
}

function getPrevSignificantSibling(node) {
	do {
		node = node.prevNamedSibling;
	} while (node && (node.type === 'Comment' || node.type === 'NewLine'));

	return node || null;
}

function getNextSignificantSibling(node) {
	do {
		node = node.nextNamedSibling;
	} while (node && (node.type === 'Comment' || node.type === 'NewLine'));

	return node || null;
}

function getUnwrapParensDescendant(node) {
	while (node.type === 'ParenthesizedExpression') {
		node = node.firstNamedChild;
	}
	return node;
}

function getUnwrapParensAncestor(node) {
	while (node.type === 'ParenthesizedExpression') {
		node = node.parent;
	}
	return node;
}

function isFunctionArgument(node) {
	if (node.type === 'FunctionArgument') return true;
	return getUnwrapParensAncestor(node.parent).type === 'FunctionArgument';
}

function isVariableReferenceAssignment(node) {
	return node.parent.type === 'SetStatement' && node.parent.firstNamedChild === node;
}

function extractNthArgument(argumentsNode, n) {
	if (n >= argumentsNode.namedChildCount) return null;
	let fnArgument = argumentsNode.firstNamedChild;
	while (n > 0) {
		fnArgument = fnArgument.nextNamedSibling;
		n--;
	}
	return getUnwrapParensDescendant(fnArgument.firstNamedChild);
}

function extractValueNodeFromSetStatement(node) {
	return getUnwrapParensDescendant(node.lastNamedChild.lastNamedChild);
}

function extractValueNodeFromDeclaration(node) {
	if (node.lastNamedChild.type !== 'Initializer') return null;
	return node.lastNamedChild.lastNamedChild;
}

function setAddMany(targetSet, iterable) {
	for (const entry of iterable) {
		targetSet.add(entry);
	}
}

function getAreDisjoint(set1, set2) {
	for (const elem of set2) {
		if (set1.has(elem)) {
			return false;
		}
	}
	return true;
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

class HandleTracker {
	constructor() {
		this.lastSetNode = null;
		this.nulled = {
			branches: 0,
			always: false,
		};
	}
}

class ControlFlow {
	constructor(validator) { 
		this.validator = validator;
		this.currentNode = null;
		this.currentFnNode = null;
		this.currentLoopNode = null;
		this.stack = [];
		this.about = new Map();
		this.aboutFunctions = new Map();
	}

	enter(node) {
		const ancestorNode = this.currentNode;
		if (this.getIsNestedNodeType(node.type)) {
			this.stack.push(node);
			this.currentNode = node;
			if (node.type === 'LoopStatement') {
				this.currentLoopNode = node;
			}
			this.about.set(node, {
				branchCount: 1,
				'exitwhen': {
					someTimes: false,
					variables: new Set(),
				},
				'return': {
					needs: this.validator.state.currentFunctionNeedsReturn,
					type: this.validator.state.currentFunctionNeedsReturn ? this.validator.getFunction(this.validator.state.currentFunctionName)?.returnType : null,
					always: false,
					branchesHave: 0,
					someTimes: false,
					global: this.validator.state.currentFunctionNeedsReturn,
					node: null,
					nodes: [],
				},
				'tests': [],
				'variables': {
					read: new Set(),
					written: new Set(),
				},
				'handles': {
					local: new Map(),
				},
			});
			if (node.type === 'FunctionBody') {
				this.currentFnNode = node;
				this.aboutFunctions.set(this.validator.state.currentFunctionName, this.about.get(node));
			}
			
		}
		this.onEnter(node, ancestorNode);
	}

	leave(node) {
		if (this.getIsNestedNodeType(node.type)) {
			this.stack.pop();
			this.currentNode = this.stack.length ? this.stack[this.stack.length - 1] : null;
			if (!this.currentNode) this.currentFnNode = null;
			this.currentLoopNode = null;
			for (let i = this.stack.length - 1; i >= 0; i--) {
				if (this.stack[i].type === 'LoopStatement') {
					this.currentLoopNode = this.stack[i];
					break;
				}
			}
		}
		this.onLeave(node, this.currentNode);
	}

	getIsNestedNodeType(nodeType) {
		return (nodeType !== 'ReturnStatement' && nodeType !== 'VariableReference' && nodeType !== 'ArrayElement');
	}

	onEnter(node, parentControlFlowNode) {
		const loopAgnosticType = node.type.slice(1);
		if (loopAgnosticType === 'IfStatement') {
			this.about.get(node).branchCount = 2;
		} else if (loopAgnosticType.startsWith('ElseIf')) {
			this.about.get(parentControlFlowNode).branchCount++;
		}
	}

	onLeave(node, parentControlFlowNode) {
		let nextSignificantNode = null;
		if (node.type === 'ReturnStatement') {
			const aboutFn = this.about.get(this.currentFnNode);
			aboutFn.return.someTimes = true;

			const returnedNode = node.namedChildCount > 0 ? getUnwrapParensDescendant(node.lastNamedChild) : null;
			if (!(returnedNode?.type === 'CallExpression' && this.aboutFunctions.get(returnedNode.firstNamedChild.text)?.return.global)) {
				if (!(returnedNode?.type === 'VariableReference' && this.validator.getSymbol(returnedNode.text)?.isGlobal)) {
					aboutFn.return.global = false;
				}
			}

			const aboutAncestor = this.about.get(parentControlFlowNode);
			if (!aboutAncestor.return.node) {
				aboutAncestor.return.node = node;
				aboutAncestor.return.always = true;
				aboutAncestor.return.someTimes = true;
			}

			if ((nextSignificantNode = getNextSignificantSibling(node)) !== null) {
				// Baseline PASS
				this.validator.emitNodeEvent(nextSignificantNode, 'unreachable_code', 'return', node);
			} else if (!aboutFn.return.needs && parentControlFlowNode === this.currentFnNode) {
				// Baseline PASS
				this.validator.emitNodeEvent(node, 'needless_return');
			}
			return;
		} else if (node.type === 'ExitWhenStatement') {
			const aboutAncestor = this.about.get(parentControlFlowNode);
			aboutAncestor.exitwhen.someTimes = true;

			const aboutLoopAncestor = this.about.get(this.currentLoopNode);
			setAddMany(aboutAncestor.exitwhen.variables, this.about.get(node.firstNamedChild).variables.read);
			return;
		} else if (node.type === 'VariableReference') {
			if (parentControlFlowNode !== null) {
				const ioEntry = node.text;
				const varInfo = this.validator.getSymbol(ioEntry);
				this.onLeaveVariable(node, parentControlFlowNode, ioEntry, varInfo);
			}
			return;
		} else if (node.type === 'ArrayElement') {
			if (parentControlFlowNode !== null) {
				const ioEntry = `${node.firstNamedChild.text},${node.lastNamedChild.text}`;
				const varInfo = this.validator.getSymbol(node.firstNamedChild.text);
				this.onLeaveVariable(node, parentControlFlowNode, ioEntry, varInfo);
			}
			return;
		} else if (node.type === 'Test') {
			if (this.currentLoopNode) {
				this.about.get(this.currentLoopNode).tests.push(node);
			}
			return;
		}
		const aboutNode = this.about.get(node);
		switch (node.type) {
			case 'FunctionBody': {
				if (aboutNode.return.needs) {
					if (!aboutNode.return.someTimes) {
						// Baseline FAIL
						this.validator.emitNodeEvent(node, 'missing_return', aboutNode.return.type);
					} else if (!aboutNode.return.always) {
						// Baseline PASS
						this.validator.emitNodeEvent(node, 'missing_return_control_flow', aboutNode.return.type);
					}
				}
				for (const [varName, varInfo] of this.validator.symbols.local) {
					if (!aboutNode.variables.read.has(varName)) {
						if (varInfo.isParameter) {
							// Baseline PASS
							this.validator.emitNodeEvent(node, 'unused_parameter', varName);
						} else {
							// Baseline PASS
							this.validator.emitNodeEvent(node, 'unused_local_variable', varName);
						}
					}

					if (!varInfo.isParameter && !isPrimitiveType(varInfo.type) && !varInfo.isArray) {
						const handleTracker = aboutNode.handles.local.get(varName);
						if (!handleTracker) {
							const lastSetValueExpression = extractValueNodeFromDeclaration(varInfo.node);
							if (lastSetValueExpression === null) {
								// Declared but never initialized.
								// Baseline PASS
								this.validator.emitNodeEvent(varInfo.node, 'local_handle_not_nulled', varName, varInfo.type, node, lastSetValueExpression);
							} else if (lastSetValueExpression.text !== 'null') {
								// Initialized to something, yet never nulled afterwards.
								// Baseline PASS
								this.validator.emitNodeEvent(varInfo.node, 'local_handle_not_nulled', varName, varInfo.type, node, lastSetValueExpression);
							}
						} else if (handleTracker.lastSetNode.type === 'SetStatement') {
							const lastSetValueExpression = extractValueNodeFromSetStatement(handleTracker.lastSetNode);
							if (lastSetValueExpression.text !== 'null') {
								// Baseline PASS
								this.validator.emitNodeEvent(handleTracker.lastSetNode, 'local_handle_not_nulled', varName, varInfo.type, node, lastSetValueExpression);
							}
						} else {
							// Currently assuming that this is an always-null IfStatement.
							//this.validator.emitNodeEvent(node, 'local_handle_not_nulled', varName, varInfo.type, node);
							//console.log(`${this.validator.state.currentFunctionName} - ${handleTracker.lastSetNode.type} (${handleTracker.lastSetNode.text}) always nulls ${varName}`);
						}
					}
					/*
					for (const [varName, {lastSetNode}] of aboutNode.handles.local) {
						if (lastSetNode.type === 'SetStatement') {
							const lastSetExpression = extractValueNodeFromSetStatement(lastSetNode);
							if (lastSetExpression.text === 'null') {
								const thisHandleTracker = aboutNode.handles.local.get(varName);
								thisHandleTracker.nulled.branches++;
								thisHandleTracker.nulled.always = (thisHandleTracker.nulled.branches === aboutNode.branchCount);
								if (thisHandleTracker.nulled.always) {
									const aboutAncestor = this.about.get(parentControlFlowNode);
									aboutAncestor.handles.local.get(varName).lastSetNode = node;
								}
							}
						} else {
							// Control flow node that always nulls
							const aboutAncestor = this.about.get(parentControlFlowNode);
							aboutAncestor.handles.local.get(varName).lastSetNode = node;
						}
					}
					*/
				}
				
				break;
			}

			case 'LoopStatement': {
				if (!aboutNode.exitwhen.someTimes && !aboutNode.return.someTimes) {
					// Baseline PASS
					this.validator.emitNodeEvent(node, 'infinite_loop');
				}

				if (aboutNode.exitwhen.variables.size && getAreDisjoint(aboutNode.exitwhen.variables, aboutNode.variables.written)) {
					if (this.validator.getIsAnyNonLocal(aboutNode.exitwhen.variables)) {
						// Baseline PASS
						this.validator.emitNodeEvent(node, 'exitwhen_non_local' /* maybe constant */);
					} else {
						// Baseline PASS
						this.validator.emitNodeEvent(node, 'exitwhen_constant');
					}
				}

				for (const testNode of aboutNode.tests) {
					const aboutTestNode = this.about.get(testNode);
					if (aboutTestNode.variables.read.size && getAreDisjoint(aboutTestNode.variables.read, aboutNode.variables.written)) {
						if (this.validator.getIsAnyNonLocal(aboutTestNode.variables.read)) {
							// Baseline PASS
							this.validator.emitNodeEvent(testNode, 'test_non_local' /* maybe constant */, 'loop', node);
						} else {
							// Baseline PASS
							this.validator.emitNodeEvent(testNode, 'test_constant', 'loop', node);
						}
					}
				}

				if (aboutNode.return.always) {
					const returnNode = aboutNode.return.node;
					let prevNode = returnNode;
					while (prevNode = getPrevSignificantSibling(prevNode)) {
						if (prevNode.type === 'ExitWhenStatement' || this.about.get(prevNode).exitwhen.someTimes) {
							aboutNode.return.always = false;
							break;
						}
					}
					if (aboutNode.return.always) {
						const aboutAncestor = this.about.get(parentControlFlowNode);
						aboutAncestor.return.always = true;
					}
				}

				// TODO: handle tracker
				// Gotta track last SetStatement -> ExitWhen -> last SetStatement -> ExitWhen
				break;
			}

			case 'RIfStatement':
			case 'LIfStatement': {
				// This flag is only set by the main RConsequent|LConsequent node
				if (aboutNode.return.always) {
					aboutNode.return.branchesHave++;
				}
				aboutNode.return.always = (aboutNode.return.branchesHave === aboutNode.branchCount);
				if (aboutNode.return.always) {
					const aboutAncestor = this.about.get(parentControlFlowNode);
					aboutAncestor.return.always = true;
				}
				if (aboutNode.exitwhen.someTimes && parentControlFlowNode.type !== 'FunctionBody') {
					const aboutAncestor = this.about.get(parentControlFlowNode);
					aboutAncestor.exitwhen.someTimes = true;
				}

				// These are also set by the main RConsequent|LConsequent node
				for (const [varName, thisHandleTracker] of aboutNode.handles.local) {
					if (thisHandleTracker.lastSetNode.type === 'SetStatement') {
						const lastSetExpression = extractValueNodeFromSetStatement(thisHandleTracker.lastSetNode);
						if (lastSetExpression.text === 'null') {
							thisHandleTracker.nulled.branches++;
							thisHandleTracker.nulled.always = (thisHandleTracker.nulled.branches === aboutNode.branchCount);
							if (thisHandleTracker.nulled.always) {
								const aboutAncestor = this.about.get(parentControlFlowNode);
								let ancestorHandleTracker = aboutAncestor.handles.local.get(varName);
								if (!ancestorHandleTracker) {
									ancestorHandleTracker = new HandleTracker();
									aboutAncestor.handles.local.set(varName, ancestorHandleTracker);
								}
								ancestorHandleTracker.lastSetNode = node;
							}
						}
					} else {
						// Control flow node that always nulls
						const aboutAncestor = this.about.get(parentControlFlowNode);
						let handleTracker = aboutAncestor.handles.local.get(varName);
						if (!handleTracker) {
							handleTracker = new HandleTracker();
							aboutAncestor.handles.local.set(varName, handleTracker);
						}
						handleTracker.lastSetNode = node;
					}
				}
				break;
			}

			case 'RElseIfStatement':
			case 'LElseIfStatement':
			case 'RElseStatement':
			case 'LElseStatement': {
				const aboutAncestor = this.about.get(parentControlFlowNode);
				if (aboutNode.return.always) {
					aboutAncestor.return.branchesHave++;
					aboutNode.return.always = false;
				}
				if (aboutNode.exitwhen.someTimes) {
					aboutAncestor.exitwhen.someTimes = true;
				}
				for (const [varName, {lastSetNode}] of aboutNode.handles.local) {
					const lastSetExpression = extractValueNodeFromSetStatement(lastSetNode);
					if (lastSetExpression.text === 'null') {
						let handleTracker = aboutAncestor.handles.local.get(varName);
						if (!handleTracker) {
							handleTracker = new HandleTracker();
							aboutAncestor.handles.local.set(varName, handleTracker);
						}
						handleTracker.nulled.branches++;
					}
				}
				break;
			}

			default:
				throw new Error(`Unreachable case - node.type was ${node.type}`);
		}

		if (aboutNode.return.always && node.type !== 'FunctionBody') {
			if (this.about.get(this.currentFnNode).return.needs) {
				if ((nextSignificantNode = getNextSignificantSibling(node)) !== null) {
					// Baseline PASS
					this.validator.emitNodeEvent(nextSignificantNode, 'unreachable_code', 'return_control_flow', node);
				}
			// In a void function
			} else if (node.type !== 'LoopStatement') {
				assert.equal(node.type.slice(1), 'IfStatement');
				if (!getNextSignificantSibling(node)) {
					// Baseline PASS
					this.validator.emitNodeEvent(node, 'needless_return_multibranch');
				}
			}
		}
	}

	onLeaveVariable(node, parentControlFlowNode, ioEntry, varInfo) {
		const aboutFnAncestor = this.about.get(this.currentFnNode);
		const isAssignment = isVariableReferenceAssignment(node);
		if (parentControlFlowNode.type === 'Test') {
			const aboutAncestor = this.about.get(parentControlFlowNode);
			aboutAncestor.variables.read.add(ioEntry);
			aboutFnAncestor.variables.read.add(ioEntry);
		} else if (isAssignment) {
			if (this.currentLoopNode) {
				const aboutLoopAncestor = this.about.get(this.currentLoopNode);
				aboutLoopAncestor.variables.written.add(ioEntry);
			}
			aboutFnAncestor.variables.written.add(ioEntry);
		} else {
			aboutFnAncestor.variables.read.add(ioEntry);
		}

		// Track handles
		if (varInfo && !isPrimitiveType(varInfo.type)) {
			const aboutAncestor = this.about.get(parentControlFlowNode);
			if (isFunctionArgument(node)) {
				aboutFnAncestor.variables.written.add(ioEntry);
				if (this.currentLoopNode) {
					const aboutLoopAncestor = this.about.get(this.currentLoopNode);
					aboutLoopAncestor.variables.written.add(ioEntry);
				}
			}
			if (isAssignment && !varInfo.isGlobal && !varInfo.isParameter && !varInfo.isArray) {
				let handleTracker = aboutAncestor.handles.local.get(varInfo.name);
				if (!handleTracker) {
					handleTracker = new HandleTracker();
					aboutAncestor.handles.local.set(varInfo.name, handleTracker);
				}
        // FIXME: It's possible that an earlier IfStatement already returned without nulling!
				handleTracker.lastSetNode = node.parent;
			}
		}
	}
}

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
		this.state = {
			currentFunction: '',
			currentFunctionNeedsReturn: false,
		};
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
		this.state = {
			currentFunction: '',
			currentFunctionNeedsReturn: false,
		};
		this.symbols = {
			types: this.getInternalTypes(),
			global: new Map(),
			local: new Map(),
			//currentFunction: '',
			currentLocal: null,
		};
	}

	loadRules() {
		if (!this.rules.length) {
			this.rules.push('core', 'sound', 'recommended');
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
		const funcName = this.state.currentFunctionName || '~';
		return this.emit(eventName, node, this.currentFile, funcName, ...rest);
	}

	getInternalTypes() {
		return new Map(internalTypes.map(name => [name, new TypeInfo(name, null, name === 'code')]));
	}

	exitFunction() {
		this.state = {
			currentFunction: '',
			currentFunctionNeedsReturn: false,
		};
		this.resetLocalSymbols();
	}

	resetLocalSymbols() {
		this.symbols.local.clear();
	}

	checkGlobals() {
		for (const [symbolName, symbolInfo] of this.symbols.global) {
			if (symbolInfo.isUsed) continue;
			if (symbolInfo.type === 'code') {
				// Baseline PASS
				this.emit(symbolInfo.node, symbolInfo.file, '~', 'unused_function', symbolName);
			} else {
				// Baseline PASS
				this.emit(symbolInfo.node, symbolInfo.file, '~', 'unused_global_variable', symbolName);
			}
		}
	}

	checkTreeInner(filePath, cst, source) {
		this.currentFile = filePath;
		this.currentTree = cst;

		this.history.push([{
			// Ensure past trees aren't deallocated
			file: this.currentFile,
			tree: this.currentTree,
		}]);

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

	checkTree(filePath, cst, source) {
		this.checkTreeInner(filePath, cst, source);
		this.checkGlobals();
		this.runDeferred();
		this.emit('end');

		const out = this.getOutput();
		this.reset();
		return out;
	}

	checkTrees(trees) {
		for (const [filePath, {cst, source}] of trees) {
			this.checkTreeInner(filePath, cst, source);
		}
		this.checkGlobals();
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
			parameters: symbolHelpers.extractParameters(findChildNamed(node, 'input')),
			returnType: symbolHelpers.extractReturnType(findChildNamed(node, 'output')),
			isConstant,
			isParameter: false,
			isTDZ: false,
			isNative,
			isGlobal: true,
			isUsed: false,
			file: this.currentFile,
		};
		this.symbols.global.set(symbolName, symbol);
		return symbol;
	}

	registerGlobalVariable(node /* GlobalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayType(typeNode);
		this.symbols.global.set(symbolName, {
			name: symbolName,
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: !isArray && node.firstChild.type === 'ConstantAttribute',
			isParameter: false,
			isTDZ: false, // TODO: TDZ for globals
			isNative: false,
			isGlobal: true,
			isUsed: false,
			file: this.currentFile,
		});
	}

	registerLocalVariable(node /* LocalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayType(typeNode);
		this.symbols.local.set(symbolName, {
			name: symbolName,
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: !isArray && node.firstChild.type === 'ConstantAttribute',
			isParameter: false,
			isTDZ: false,
			isNative: false,
			isGlobal: false,
			isUsed: false,
			file: this.currentFile,
		});
	}

	prepareRegisterLocalVariable(node /* LocalDeclarationStatement */, symbolName, typeNode /* AtomicType | ArrayType */) {
		const isArray = isArrayType(typeNode);
		this.symbols.currentLocal = [symbolName, {
			name: symbolName,
			node: node,
			type: typeNode.firstChild.text,
			isArray: isArray,
			isConstant: !isArray && node.firstChild.type === 'ConstantAttribute',
			isParameter: false,
			isTDZ: !isArray,
			isNative: false,
			isGlobal: false,
			isUsed: false,
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

	getIsAlwaysTrue(node, t) {
		if (node.type === 'Literal' && node.text === 'true') return true;
		return false;
	}

	getIsAlwaysFalse(node) {
		if (node.type === 'Literal' && node.text === 'false') return true;
		return false;
	}

	getTrivialTestValue(node) {
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
					this.registerType(node, declName, superName);
				}
				break;
			}
			case 'FunctionSignature': {
				const declName = findChildNamed(node, 'name').text;
				if (this.symbols.global.has(declName)) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'shadowing', 'function', 'global', 'global', declName);
				}
				const symbol = this.registerFunction(node, declName)

				if (node.parent.type === 'FunctionDeclaration') {
					this.state.currentFunctionName = declName;
					this.state.currentFunctionNeedsReturn = symbol.returnType !== null;

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
					this.emitNodeEvent(node, 'shadowing', 'variable', 'global', 'global', declName);
				}
				if (isArrayType(declTypeNode) && this.symbols.types.get(atomicType)?.onlyAtomic) {
					// Baseline FAIL
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
					this.emitNodeEvent(node, 'shadowing', 'variable', 'local', 'local', declName);
				} else if (this.symbols.global.has(declName)) {
					// Baseline PASS
					this.emitNodeEvent(node, 'shadowing', 'variable', 'global', 'local', declName);
				}
				if (isArrayType(declTypeNode) && this.symbols.types.get(atomicType)?.onlyAtomic) {
					// Baseline FAIL
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
					if ((declaredSymbol.returnType === null) !== (node.parent.type === 'CallStatement')) {
						if (declaredSymbol.returnType === null) {
							// Baseline FAIL
							this.emitNodeEvent(node, 'void_call_as_expression', calleeName);
						} else {
							// Baseline PASS
							this.emitNodeEvent(node, 'return_value_discarded', 'eager', calleeName, declaredSymbol.returnType);
						}
					}
					if (this.state.currentFunctionName === calleeName) {
						if (node.closest('LocalDeclarationStatement')) {
							// Baseline FAIL
							this.emitNodeEvent(node, 'recursive_function_local', calleeName);
						} else {
							// Baseline PASS
							this.emitNodeEvent(node, 'recursive_function', calleeName);
						}
					}
					if (!declaredSymbol.isConstant && this.getFunction(this.state.currentFunctionName)?.isConstant) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'const_function_violation', `const ${this.state.currentFunctionName}`, calleeName);
					}
					if (!this.state.currentFunctionName && isAPINeedsInitialization(calleeName)) {
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
				if (declaredSymbol && isAPIHandleDestroyer(calleeName)) {
					const argumentsNode = ensureKind(callExpressionNode.lastNamedChild, 'FunctionArgumentList');
					const subCalleeNode = argumentsNode ? extractNthArgument(argumentsNode, 0) : null;
					if (subCalleeNode && (subCalleeNode.type === 'VariableReference' || subCalleeNode.type === 'ArrayElement')) {
						const symbolName = subCalleeNode.type === 'VariableReference' ? subCalleeNode.text : subCalleeNode.firstNamedChild.text;
						const symbolInfo = this.getSymbol(symbolName);
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
				break;
			}

			case 'SetStatement': {
				const bindNode = findChildNamed(node, 'binding');
				const isArraySet = bindNode.type === 'ArrayElement';
				const bindName = isArraySet ? bindNode.firstChild.text : bindNode.text;
				const declaredSymbol = this.getSymbol(bindName);
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
						this.validateNodeType(node, declaredSymbol.type, node.lastChild, `Value assigned to '${bindName}'`)
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
							this.emitNodeEvent(node, 'higher_order_type_mismatch', 'boolean', declaredSymbol.returnType ?? 'nothing', higherOrderName, funcName);
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
				const declaredSymbol = this.getSymbol(variableName);
				if (!declaredSymbol) {
					// Baseline FAIL
					this.emitNodeEvent(node, 'variable_non_existent', variableName);
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
					const isWrite = node.parent.type === 'SetStatement' && node.parent.firstNamedChild === node;
					if (isWrite) {
						this.emitNodeEvent(node, 'array_access_required', 'write', variableName);
					} else {
						this.emitNodeEvent(node, 'array_access_required', 'read', variableName);
					}
				}
				if (declaredSymbol.isGlobal) {
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
					if (!declaredSymbol.isArray) {
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
			case 'RElseIfStatement':
			case 'LElseIfStatement': {
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

			case 'RElseStatement':
			case 'LElseStatement': {
				this.controlFlow.enter(node);
				break;
			}

			case 'ExitWhenStatement': {
				this.controlFlow.enter(node);
				break;
			}

			case 'ReturnStatement': {
				this.controlFlow.enter(node);
				const returnsSomething = node.namedChildCount > 0;
				const expectedReturnType = this.getFunction(this.state.currentFunctionName)?.returnType;
				if (returnsSomething === (expectedReturnType === null)) {
					if (expectedReturnType === null) {
						// Baseline FAIL
						this.emitNodeEvent(node, 'return_value_unexpected', node.firstNamedChild);
					} else {
						// Baseline FAIL
						this.emitNodeEvent(node, 'return_value_required', expectedReturnType);
					}
				} else if (expectedReturnType !== null) {
					this.validateNodeType(node, expectedReturnType, node.firstNamedChild, `Return value from ${this.state.currentFunctionName}`);
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
				this.exitFunction();
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
			case 'RElseIfStatement':
			case 'LElseIfStatement': {
				this.controlFlow.leave(node);
				break;
			}

			case 'RElseStatement':
			case 'LElseStatement': {
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
