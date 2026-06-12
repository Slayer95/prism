"use strict";

const assert = require('assert/strict');
const path = require('path');
const util = require('util');

const {ValidatorResult} = require('./../../lib/constants');
const HandleTracker = require('./../../lib/handle-tracker');

const {
	TypeInfo,
	internalTypes, isNumberType, isPrimitiveType, isHandleType,
} = require('./../language');

const {
	Set: setHelpers/*{getAreDisjoint, addMany}*/,
} = require('./../../lib/iterable-helpers');

const {
	SyntaxStack,
} = require('./../../lib/syntax-stack');

const {
	getCallExpressionForFunctionArgumentOrWrapped,
} = require('./../language/function');

const {
	isLoopNode,
} = require('./../language/loop');

const {
	getTestNodes,
} = require('./../language/if');

const {
	isArrayTypeNode,
} = require('./../language/var-declaration');

const {
	extractValueNodeFromSetStatement,
	extractValueNodeFromDeclaration,
} = require('./../language/var-value');

const {
	isVariableReferenceArray,
	isVariableReferenceAssignment,
} = require('./../language/var-reference');

const {
	getPrevSignificantSibling,
	getNextSignificantSibling,
	getSignificantSiblingsBefore,
	getSignificantSiblingsAfter,
	getInsideParens,
	getOutsideParens,
	isLastSignificantSibling,
	getClosestAnyRL,
	isNodeTypeAnyRL,
	assertNodeTypeAnyRL,
} = require('./../../lib/tree-helpers');

const {
	Quantifier,
	QuantifierBasis,
	mergePartitionQuantifiers,
	isPartitionAny,
	isPartitionEvery,
	isNever, isSomeTimes, isAlways,
	toString: quantifierToString,
} = require('./../logic/predicate');

const N2I = require('./../language/n2i');

class ASTInference {
	constructor(validator) { 
		this.validator = validator;
		this.currentNode = null;
		this.currentFnNode = null;
		this.currentLoopFrame = null;
		this.currentIfFrame = null;
		this.stack = new SyntaxStack();
		this.about = new Map();
		this.aboutFunctions = new Map();
	}

	enter(node) {
		const ancestorNode = this.currentNode;
		if (this.getIsNestedNodeType(node.type)) {
			this.currentNode = node;
			if (node.type === 'LoopStatement') {
				this.stack.push(node, 'loop');
				this.currentLoopFrame = this.stack.loop.peek();
			} else if (isNodeTypeAnyRL(node, 'IfStatement')) {
				this.stack.push(node, 'if');
				this.currentIfFrame = this.stack.if.peek();
			} else {
				this.stack.push(node, 'other');
			}

			assert(this.validator.currentFunction, `No current function found when entering ${node.type} in ${node.parent.text}`);

			const aboutNode = {
				branchCount: 1,
				'exitwhen': {
					//someTimes: false,
					quantifier: Quantifier.kNone,
					variables: new Set(),
					collected: [/*{exitWhenNode: null, ifPath: []}*/],
				},
				'return': {
					needs: !!this.validator.currentFunction.returnType,
					type: this.validator.currentFunction.returnType,
					//always: false,
					branchesHave: 0,
					//someTimes: false,
					quantifier: Quantifier.kNone,
					global: !!this.validator.currentFunction.returnType,
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
			};
			this.about.set(node, aboutNode);
			/* TODO: Remove this when stable */
			aboutNode.return._quantifier = 0;
			Object.defineProperty(aboutNode.return, 'quantifier', {
				get() {
					return this._quantifier;
				},
				set(val) {
					if (val !== Quantifier.kNone && val !== Quantifier.kSome && val !== Quantifier.kAll) {
						throw new Error(`Bad assignment ${val}`);
					}
					this._quantifier = val;
				},
			});
			if (node.type === 'FunctionBody') {
				this.currentFnNode = node;
				this.aboutFunctions.set(this.validator.currentFunction.name, this.about.get(node));
			}
			
		}
		this.onEnter(node, ancestorNode);
	}

	leave(node) {
		const isNested = this.getIsNestedNodeType(node.type);
		const ancestorNode = isNested ? this.stack.peek2() : this.currentNode;
		this.onLeave(node, ancestorNode);
		if (isNested) {
			this.stack.pop(node);
			this.currentNode = ancestorNode;
			if (!this.currentNode) this.currentFnNode = null;
			if (node.type === 'LoopStatement') {
				this.currentLoopFrame = this.stack.loop.peek();
			} else if (isNodeTypeAnyRL(node, 'IfStatement')) {
				this.currentIfFrame = this.stack.if.peek();
			} else if (isNodeTypeAnyRL(node, 'Consequent') || isNodeTypeAnyRL(node, 'Alternate')) {
				this.currentIfFrame.branch++;
			}
		}
	}

	getIsNestedNodeType(nodeType) {
		return (nodeType !== 'ReturnStatement' && nodeType !== 'VariableReference' && nodeType !== 'ArrayElement');
	}

	getExitWhenVariables(exitWhenNode, ifPath) {
		const readVariables = new Set();
		setHelpers.addMany(readVariables, this.about.get(exitWhenNode.firstNamedChild).variables.read);
		for (const {node, branch} of ifPath) {
			for (const testNode of getTestNodes(node, branch)) {
				setHelpers.addMany(readVariables, this.about.get(testNode).variables.read);
			}
		}
		return readVariables;
	}

	getWhetherExitWhenVariablesIntersect(exitWhenNode, ifPath, writeVariables, exitWhenVariables) {
		for (const varName of this.about.get(exitWhenNode.firstNamedChild).variables.read) {
			exitWhenVariables.add(varName);
			if (writeVariables.has(varName)) return true;
		}
		for (const {node, branch} of ifPath) {
			for (const testNode of getTestNodes(node, branch)) {
				for (const varName of this.about.get(testNode).variables.read) {
					exitWhenVariables.add(varName);
					if (writeVariables.has(varName)) return true;
				}
			}
		}
		return false;
	}

	getIsGlobalReturn(node /* ReturnStatement */) {
		const returnedNode = node.namedChildCount > 0 ? getInsideParens(node.lastNamedChild) : null;
		if (!returnedNode) {
			return false;
		}
		if (returnedNode.type === 'CallExpression' && this.aboutFunctions.get(N2I.CallExpression.extractCalleeName(returnedNode))?.return.global) {
			return true;
		}
		if (returnedNode.type === 'VariableReference' && this.validator.getNonTypeSymbol(returnedNode.text)?.isGlobal) {
			return true;
		}
		return false;
	}

	onEnter(node, ancestorNode) {
		const loopAgnosticType = node.type.slice(1);
		if (loopAgnosticType === 'IfStatement') {
			this.about.get(node).branchCount = 2;
		} else if (loopAgnosticType === 'Alternate' && node.parent.type.length !== `RElseStatement`.length) {
			this.about.get(ancestorNode).branchCount++;
		}
	}

	onLeave(node, ancestorNode) {
		let nextSignificantNode;
		if (node.type === 'ReturnStatement') {
			const aboutFn = this.about.get(this.currentFnNode);
			if (!this.getIsGlobalReturn(node)) {
				aboutFn.return.global = false;
			}

			const aboutAncestor = this.about.get(ancestorNode);
			if (!aboutAncestor.return.node) {
				aboutAncestor.return.node = node;
				aboutFn.return.nodes.push(node);
				if (isSomeTimes(aboutAncestor.exitwhen.quantifier)) {
					aboutAncestor.return.quantifier = Quantifier.kSomeTimes;
				} else {
					aboutAncestor.return.quantifier = Quantifier.kAlways;
				}
			}

			if ((nextSignificantNode = getNextSignificantSibling(node)) !== null) {
				// Baseline PASS
				this.validator.emitNodeEvent(nextSignificantNode, 'unreachable_code', 'return', node);
			} else if (!aboutFn.return.needs && ancestorNode === this.currentFnNode) {
				// Baseline PASS
				this.validator.emitNodeEvent(node, 'needless_return');
			}
			return;
		} else if (node.type === 'ExitWhenStatement') {
			const aboutAncestor = this.about.get(ancestorNode);
			if (!isAlways(aboutAncestor.return.quantifier)) {
				aboutAncestor.exitwhen.quantifier |= QuantifierBasis.kSome;

				const aboutLoopAncestor = this.about.get(this.currentLoopFrame.node);
				aboutLoopAncestor.exitwhen.collected.push({
					exitWhenNode: node,
					ifPath: this.stack.getIfStackInClosestLoop(),
				});
			}
			return;
		} else if (node.type === 'VariableReference') {
			if (ancestorNode !== null) {
				const ioEntry = node.text;
				const varInfo = this.validator.getNonTypeSymbol(ioEntry);
				this.onLeaveVariable(node, ancestorNode, ioEntry, varInfo);
			}
			return;
		} else if (node.type === 'ArrayElement') {
			if (ancestorNode !== null) {
				const ioEntry = `${node.firstNamedChild.text},${node.lastNamedChild.text}`;
				const varInfo = this.validator.getNonTypeSymbol(node.firstNamedChild.text);
				this.onLeaveVariable(node, ancestorNode, ioEntry, varInfo);
			}
			return;
		} else if (node.type === 'Test') {
			if (node.parent.type !== 'ExitWhenStatement') {
				const ifAncestor = this.stack.if.peek();
				const aboutIfAncestor = this.about.get(ifAncestor.node);
				aboutIfAncestor.tests.push(node);
			}
			return;
		} else {
			const aboutNode = this.about.get(node);
			const aboutAncestor = ancestorNode ? this.about.get(ancestorNode) : null;
			if (aboutAncestor) {
				// Propagate return and exitwhen upwards,
				// but make sure exitwhen does not escape the closest loop.
				if (isSomeTimes(aboutNode.return.quantifier)) {
					aboutAncestor.return.quantifier |= QuantifierBasis.kSome;
				}
				if (!isLoopNode(node) && isSomeTimes(aboutNode.exitwhen.quantifier)) {
					aboutAncestor.exitwhen.quantifier |= QuantifierBasis.kSome;
				}
			}
			switch (node.type) {
				case 'FunctionBody': {
					if (aboutNode.return.needs) {
						if (isNever(aboutNode.return.quantifier)) {
							// Baseline FAIL
							this.validator.emitNodeEvent(node, 'missing_return', aboutNode.return.type);
						} else if (!isAlways(aboutNode.return.quantifier)) {
							// Baseline PASS
							this.validator.emitNodeEvent(node, 'missing_return_control_flow', aboutNode.return.type);
						}
					}
					for (const [varName, varInfo] of this.validator.symbols.local) {
						if (!varInfo.isParameter && isHandleType(varInfo.type) && !varInfo.isArray) {
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
								//console.log(`${this.validator.currentFunction.name} - ${handleTracker.lastSetNode.type} (${handleTracker.lastSetNode.text}) always nulls ${varName}`);
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
										const aboutAncestor = this.about.get(ancestorNode);
										aboutAncestor.handles.local.get(varName).lastSetNode = node;
									}
								}
							} else {
								// Control flow node that always nulls
								const aboutAncestor = this.about.get(ancestorNode);
								aboutAncestor.handles.local.get(varName).lastSetNode = node;
							}
						}
						*/
					}
					
					break;
				}

				case 'LoopStatement': {
					if (isNever(aboutNode.exitwhen.quantifier) && isNever(aboutNode.return.quantifier)) {
						// Baseline PASS
						this.validator.emitNodeEvent(node, 'infinite_loop');
					}

					let anySuccess = false;
					let maybeReadOnlyVariables = new Set();
					for (const {exitWhenNode, ifPath} of aboutNode.exitwhen.collected) {
						if (this.getWhetherExitWhenVariablesIntersect(exitWhenNode, ifPath, aboutNode.variables.written, maybeReadOnlyVariables)) {
							anySuccess = true;
							break;
						}
					}
					if (!anySuccess) {
						if (this.validator.getIsAnyNonLocal(maybeReadOnlyVariables)) {
							// Baseline PASS
							this.validator.emitNodeEvent(node, 'exitwhen_non_local' /* maybe constant */);
						} else {
							// Baseline PASS
							this.validator.emitNodeEvent(node, 'exitwhen_constant');
						}
						//setHelpers.addMany(aboutAncestor.exitwhen.variables, this.about.get(node.firstNamedChild).variables.read);
					}

					// TODO: Maybe generalize to loop_constant_expression (note: split apart VariableReference,ArrayElement|OtherExpressions)
					for (const testNode of aboutNode.tests) {
						const aboutTestNode = this.about.get(testNode);
						if (aboutTestNode.variables.read.size && setHelpers.getAreDisjoint(aboutTestNode.variables.read, aboutNode.variables.written)) {
							if (this.validator.getIsAnyNonLocal(aboutTestNode.variables.read)) {
								// Baseline PASS
								this.validator.emitNodeEvent(testNode, 'test_non_local' /* maybe constant */, 'loop', node);
							} else {
								// Baseline PASS
								this.validator.emitNodeEvent(testNode, 'test_constant', 'loop', node);
							}
						}
					}

					/*
					if (isAlways(aboutNode.return.quantifier)) {
						const returnNode = aboutNode.return.node;
						let prevNode = returnNode;
						// eslint-disable-next-line no-cond-assign
						while (prevNode = getPrevSignificantSibling(prevNode)) {
							if (prevNode.type === 'ExitWhenStatement' || isSomeTimes(this.about.get(prevNode).exitwhen.quantifier)) {
								aboutNode.return.always = false;
								break;
							}
						}
						if (aboutNode.return.always) {
							const aboutAncestor = this.about.get(ancestorNode);
							aboutAncestor.return.always = true;
						}
					}
					*/

					if (isAlways(aboutNode.return.quantifier)) {
						const aboutAncestor = this.about.get(ancestorNode);
						aboutAncestor.return.quantifier = Quantifier.kAlways;
					}

					// TODO: handle tracker
					// Gotta track last SetStatement -> ExitWhen -> last SetStatement -> ExitWhen
					break;
				}

				case 'RIfStatement':
				case 'LIfStatement': {
					aboutNode.return.quantifier = (
						(aboutNode.return.branchesHave === aboutNode.branchCount) ? Quantifier.kAlways :
						(aboutNode.return.branchesHave > 0 ? Quantifier.kSome : Quantifier.kNone)
					);
					if (isAlways(aboutNode.return.quantifier)) {
						const aboutAncestor = this.about.get(ancestorNode);
						aboutAncestor.return.quantifier = Quantifier.kAll;
					}
					if (isSomeTimes(aboutNode.exitwhen.quantifier) && ancestorNode.type !== 'FunctionBody') {
						const aboutAncestor = this.about.get(ancestorNode);
						aboutAncestor.exitwhen.quantifier |= QuantifierBasis.kSome;
					}

					for (const [varName, thisHandleTracker] of aboutNode.handles.local) {
						thisHandleTracker.nulled.quantifier = (thisHandleTracker.nulled.branches === aboutNode.branchCount) ? Quantifier.kAll : Quantifier.kNone;
						if (isAlways(thisHandleTracker.nulled.quantifier)) {
							const aboutAncestor = this.about.get(ancestorNode);
							let ancestorHandleTracker = aboutAncestor.handles.local.get(varName);
							if (!ancestorHandleTracker) {
								ancestorHandleTracker = new HandleTracker();
								aboutAncestor.handles.local.set(varName, ancestorHandleTracker);
							}
							ancestorHandleTracker.lastSetNode = node;
						}
					}
					break;
				}

				case 'RConsequent':
				case 'LConsequent':
				case 'RAlternate':
				case 'LAlternate': {
					const aboutAncestor = this.about.get(ancestorNode);
					if (isAlways(aboutNode.return.quantifier)) {
						aboutAncestor.return.branchesHave++;
					}
					if (isSomeTimes(aboutNode.exitwhen.quantifier)) {
						aboutAncestor.exitwhen.quantifier |= QuantifierBasis.kSome;
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

			if (isAlways(aboutNode.return.quantifier) && node.type !== 'FunctionBody' && !isNodeTypeAnyRL(node.parent, 'IfStatement')) {
				const fnNeedsReturn = this.about.get(this.currentFnNode).return.needs;
				if (fnNeedsReturn) {
					if ((nextSignificantNode = getNextSignificantSibling(node)) !== null) {
						// Baseline PASS
						this.validator.emitNodeEvent(nextSignificantNode, 'unreachable_code', 'return_control_flow', node);
					}
				// In a void function
				} else if (isNodeTypeAnyRL(node, 'IfStatement') && isLastSignificantSibling(node)) {
					// Baseline PASS
					this.validator.emitNodeEvent(node, 'needless_return_multibranch');
				}
			}
		}
	}

	trackVariableRead(node, ancestorNode, ioEntry, varInfo /* maybe null */) {
		const aboutFnAncestor = this.about.get(this.currentFnNode);
		aboutFnAncestor.variables.read.add(ioEntry);
		if (ancestorNode.type === 'Test') {
			this.trackVariableTested(node, ancestorNode, ioEntry, varInfo);
		}
	}

	trackVariableTested(node, ancestorNode, ioEntry/*, varInfo*/ /* maybe null */) {
		const aboutTestNode = this.about.get(ancestorNode);
		aboutTestNode.variables.read.add(ioEntry);
	}

	trackVariableWrite(node, ancestorNode, ioEntry/*, varInfo*/ /* maybe null */) {
		const aboutFnAncestor = this.about.get(this.currentFnNode);
		aboutFnAncestor.variables.written.add(ioEntry);
		if (this.currentLoopFrame) {
			const aboutLoopAncestor = this.about.get(this.currentLoopFrame.node);
			aboutLoopAncestor.variables.written.add(ioEntry);
		}
	}

	trackHandlePassByRef(node, ancestorNode, ioEntry, varInfo/*, callExpressionNode*/) {
		/*
		const aboutFnAncestor = this.about.get(this.currentFnNode);
		aboutFnAncestor.variables.written.add(ioEntry);
		if (this.currentLoopFrame) {
			const aboutLoopAncestor = this.about.get(this.currentLoopFrame);
			aboutLoopAncestor.variables.written.add(ioEntry);
		}*/
		this.trackVariableWrite(node, ancestorNode, ioEntry, varInfo);
	}

	onLeaveVariable(node, ancestorNode, ioEntry, varInfo /* maybe null */) {
		//const aboutFnAncestor = this.about.get(this.currentFnNode);
		const isAssignment = isVariableReferenceAssignment(node);
		if (isAssignment) {
			this.trackVariableWrite(node, ancestorNode, ioEntry, varInfo);
		} else {
			this.trackVariableRead(node, ancestorNode, ioEntry, varInfo);
		}

		// Track handles
		if (varInfo && isHandleType(varInfo.type)) {
			const aboutAncestor = this.about.get(ancestorNode);
			const callExpressionNode = getCallExpressionForFunctionArgumentOrWrapped(node);
			if (callExpressionNode) {
				this.trackHandlePassByRef(node, ancestorNode, ioEntry, varInfo, callExpressionNode);
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

module.exports = ASTInference;
