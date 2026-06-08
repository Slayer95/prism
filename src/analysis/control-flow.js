"use strict";

const assert = require('assert/strict');
const path = require('path');
const util = require('util');

const {ValidatorResult} = require('./../../lib/constants');
const HandleTracker = require('./../../lib/handle-tracker');

const {
	TypeInfo,
	internalTypes, isNumberType, isPrimitiveType,
	isAPINeedsInitialization, isAPIHandleDestroyer, isAPINullUnsafe,
} = require('./../language');

const {
	Set: setHelpers/*{getAreDisjoint, addMany}*/,
} = require('./../../lib/iterable-helpers');

const {
	extractParameters,
	extractReturnType,
	extractNthArgument,
	isFunctionArgument,
} = require('./../analysis/function');

const {
	isLoopNode,
} = require('./../analysis/loop');

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
	getPrevSignificantSibling,
	getNextSignificantSibling,
	getSignificantSiblingsBefore,
	getSignificantSiblingsAfter,
	getUnwrapParensDescendant,
	getUnwrapParensAncestor,
	isLastSignificantSibling,
	getClosestAnyRL,
	isNodeTypeAnyRL,
	assertNodeTypeAnyRL,
} = require('./../../lib/tree-helpers');

class ControlFlow {
	constructor(validator) { 
		this.validator = validator;
		this.currentNode = null;
		this.currentFnNode = null;
		this.currentLoopNode = null;
		this.currentIfNode = null;
		this.stack = {
			global: [],
			loop: [],
			loopDepths: [],
			if: [],
			ifDepths: [],
		};
		this.about = new Map();
		this.aboutFunctions = new Map();
	}

	enter(node) {
		const ancestorNode = this.currentNode;
		if (this.getIsNestedNodeType(node.type)) {
			const stackDepth = this.stack.global.push(node) - 1;
			this.currentNode = node;
			if (node.type === 'LoopStatement') {
				this.currentLoopNode = node;
				this.stack.loop.push(node);
				this.stack.loopDepths.push(stackDepth);
			} else if (isNodeTypeAnyRL(node, 'IfStatement')) {
				this.stack.ifDepths.push(stackDepth);
				this.stack.if.push([node, -1]);
				this.currentIfNode = this.stack.if[this.stack.if.length - 1];
			}
			this.about.set(node, {
				branchCount: 1,
				'exitwhen': {
					someTimes: false,
					variables: new Set(),
					collected: [/*{exitWhenNode: null, ifPath: []}*/],
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
			assert.equal(this.stack.global[this.stack.global.length - 1], node);
			this.stack.global.pop();
			this.currentNode = this.stack.global.length ? this.stack.global[this.stack.global.length - 1] : null;
			if (!this.currentNode) this.currentFnNode = null;
			if (node.type === 'LoopStatement') {
				this.stack.loop.pop();
				this.stack.loopDepths.pop();
				this.currentLoopNode = this.stack.loop.length ? this.stack.loop[this.stack.loop.length - 1] : null;
			} else if (isNodeTypeAnyRL(node, 'IfStatement')) {
				this.stack.if.pop();
				this.stack.ifDepths.pop();
				this.currentIfNode = this.stack.if.length ? this.stack.if[this.stack.if.length - 1] : null;
			} else if (isNodeTypeAnyRL(node, 'Consequent') || isNodeTypeAnyRL(node, 'Alternate')) {
				this.currentIfNode[1]++;
			}
		}
		this.onLeave(node, this.currentNode);
	}

	getClosestInStack(type) {
		for (let i = this.stack.length - 1; i >= 0; i--) {
			if (this.stack[i].type === type) {
				return this.stack[i];
			}
		}
		return null;
	}

	getClosestInStackAnyRL(type) {
		for (let i = this.stack.length - 1; i >= 0; i--) {
			if (isNodeTypeAnyRL(this.stack[i], type)) {
				return this.stack[i];
			}
		}
		return null;
	}

	getIsNestedNodeType(nodeType) {
		return (nodeType !== 'ReturnStatement' && nodeType !== 'VariableReference' && nodeType !== 'ArrayElement');
	}

	getIfStatementNodesInLoopStack() {
		const globalDepthForLoop = this.stack.loopDepths[this.stack.loopDepths - 1];
		for (let i = this.stack.ifDepths.length - 1; i >= 0; i--) {
			if (this.stack.ifDepths[i] < globalDepthForLoop) {
				break;
			}
			return this.stack.if.slice(i + 1);
		}
		return [];
	}

	getExitWhenVariables(exitWhenNode, ifPath) {
		const readVariables = new Set();
		setHelpers.addMany(readVariables, this.about.get(exitWhenNode.firstNamedChild).variables.read);
		for (const [ifNode, branchIdx] of ifPath) {
			for (const testNode of getTestNodes(ifNode, branchIdx)) {
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
		for (const [ifNode, branchIdx] of ifPath) {
			console.log(`Branch #${branchIdx}: ${ifNode.text}`);
			for (const testNode of getTestNodes(ifNode, branchIdx)) {
				for (const varName of this.about.get(testNode).variables.read) {
					exitWhenVariables.add(varName);
					if (writeVariables.has(varName)) return true;
				}
			}
		}
		return false;
	}

	onEnter(node, parentControlFlowNode) {
		const loopAgnosticType = node.type.slice(1);
		if (loopAgnosticType === 'IfStatement') {
			this.about.get(node).branchCount = 2;
		} else if (loopAgnosticType === 'Alternate' && node.parent.type.length !== `RElseStatement`.length) {
			this.about.get(parentControlFlowNode).branchCount++;
		}
	}

	onLeave(node, parentControlFlowNode) {
		let nextSignificantNode = null;
		if (node.type === 'ReturnStatement') {
			const aboutFn = this.about.get(this.currentFnNode);
			//aboutFn.return.someTimes = true;

			const returnedNode = node.namedChildCount > 0 ? getUnwrapParensDescendant(node.lastNamedChild) : null;
			if (!(returnedNode?.type === 'CallExpression' && this.aboutFunctions.get(returnedNode.firstNamedChild.text)?.return.global)) {
				if (!(returnedNode?.type === 'VariableReference' && this.validator.getSymbol(returnedNode.text)?.isGlobal)) {
					aboutFn.return.global = false;
				}
			}

			const aboutAncestor = this.about.get(parentControlFlowNode);
			if (!aboutAncestor.return.node) {
				aboutAncestor.return.node = node;
				aboutAncestor.return.someTimes = true;
				if (!aboutAncestor.exitwhen.someTimes) {
					aboutAncestor.return.always = true;
				}
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
			if (!aboutAncestor.return.always) {
				aboutAncestor.exitwhen.someTimes = true;

				const aboutLoopAncestor = this.about.get(this.currentLoopNode);
				aboutLoopAncestor.exitwhen.collected.push({
					exitWhenNode: node,
					ifPath: this.getIfStatementNodesInLoopStack(),
				});
			}
			//setHelpers.addMany(aboutAncestor.exitwhen.variables, this.about.get(node.firstNamedChild).variables.read);
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
			if (node.parent.type !== 'ExitWhenStatement') {
				const ifAncestor = getClosestAnyRL(node, 'IfStatement');
				const aboutIfAncestor = this.about.get(ifAncestor);
				aboutIfAncestor.tests.push(node);
			}
			return;
		} else {
			const aboutNode = this.about.get(node);
			const aboutAncestor = parentControlFlowNode ? this.about.get(parentControlFlowNode) : null;
			if (aboutAncestor) {
				if (aboutNode.return.someTimes) {
					aboutAncestor.return.someTimes = true;
				}
				if (!isLoopNode(node)) {
					if (aboutNode.exitwhen.someTimes) {
						aboutAncestor.exitwhen.someTimes = true;
					}
				}
			}
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
					aboutNode.return.always = (aboutNode.return.branchesHave === aboutNode.branchCount);
					if (aboutNode.return.always) {
						const aboutAncestor = this.about.get(parentControlFlowNode);
						aboutAncestor.return.always = true;
					}
					if (aboutNode.exitwhen.someTimes && parentControlFlowNode.type !== 'FunctionBody') {
						const aboutAncestor = this.about.get(parentControlFlowNode);
						aboutAncestor.exitwhen.someTimes = true;
					}

					for (const [varName, thisHandleTracker] of aboutNode.handles.local) {
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
					break;
				}

				case 'RConsequent':
				case 'LConsequent':
				case 'RAlternate':
				case 'LAlternate': {
					const aboutAncestor = this.about.get(parentControlFlowNode);
					if (aboutNode.return.always) {
						aboutAncestor.return.branchesHave++;
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

			if (aboutNode.return.always && node.type !== 'FunctionBody' && !isNodeTypeAnyRL(node.parent, 'IfStatement')) {
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

module.exports = ControlFlow;
