"use strict";

const assert = require('assert/strict');

const {isNodeTypeAnyRL} = require('./tree-helpers');

const FrameTypes = {
	kAny: 0,
	kStmt: 1,
	kIf: 2,
	kLoop: 3,
};

class SparseSyntaxStack {
	constructor(type) {
		this.type = type;
		this.stack = [];
	}

	push(node, globalIndex, branch = -1) {
		this.stack.push({node, globalIndex, branch});
	}

	pop() {
		this.stack.pop();
	}

	peek() {
		return this.stack[this.stack.length - 1] ?? null;
	}

	get size() {
		return this.stack.length;
	}

	isEmpty() {
		return this.stack.length === 0;
	}

	*[Symbol.iterator]() {
		for (let i = this.stack.length -1; i >= 0; i--) {
			yield this.stack[i];
		}
	}
}

class SyntaxStack {
	constructor() {
		this.global = [];
		this.if = new SparseSyntaxStack(FrameTypes.kIf);
		this.loop = new SparseSyntaxStack(FrameTypes.kLoop);
		this.stmt = new SparseSyntaxStack(FrameTypes.kStmt);
	}

	push(node, type) {
		const globalIndex = this.global.push(node) - 1;
		switch (type) {
			case FrameTypes.kIf:
				this.if.push(node, globalIndex, -1);
				this.stmt.push(node, globalIndex, -1);
				break;
			case FrameTypes.kLoop:
				this.loop.push(node, globalIndex, -1);
				this.stmt.push(node, globalIndex, -1);
				break;
			case FrameTypes:kStmt:
				this.stmt.push(node, globalIndex, -1);
				break;
			default:
				break;
		}
	}

	pop(node = this.global.at(-1)) {
		assert.equal(this.global.at(-1), node, `Expected last node in stack to be ${node.type}, but was (another) ${this.global.at(-1)?.type}`);
		this.global.pop();
		if (this.if.peek() === node) {
			this.if.pop();
			this.stmt.pop();
		} else if (this.loop.peek() === node) {
			this.loop.pop();
			this.stmt.pop();
		} else if (this.stmt.peek() === node) {
			this.stmt.pop();
		}
	}

	peek() {
		return this.global.length >= 1 ? this.global[this.global.length - 1] : null;
	}

	peek2() {
		return this.global.length >= 2 ? this.global[this.global.length - 2] : null;
	}

	get size() {
		return this.global.length;
	}

	isEmpty() {
		return this.global.length === 0;
	}

	checkEmpty() {
		assert.equal(this.if.size, 0);
		assert.equal(this.loop.size, 0);
		assert.equal(this.stmt.size, 0);
		assert.equal(this.global.length, 0);
	}

	getClosest(type) {
		for (const node of this) {
			if (node.type === type) {
				return node;
			}
		}
		return null;
	}

	getClosestAnyRL(type) {
		for (const node of this) {
			if (isNodeTypeAnyRL(node, type)) {
				return node;
			}
		}
		return null;
	}

	getClosestLoop() {
		return this.getClosest('LoopStatement');
	}

	getClosestIf() {
		return this.getClosestAnyRL('IfStatement');
	}

	getIfStackInClosestLoop() {
		const globalDepthForLoop = this.loop.peek().globalIndex;
		for (let i = this.if.size - 1; i >= 0; i--) {
			if (globalDepthForLoop < this.if.stack[i].depth) {
				continue;
			}
			return this.if.stack.slice(i + 1);
		}
		return this.if.stack.slice();
	}

	*[Symbol.iterator]() {
		for (let i = this.global.length -1; i >= 0; i--) {
			yield this.global[i];
		}
	}
}

SyntaxStack.FrameTypes = FrameTypes;

module.exports = {
	SparseSyntaxStack,
	SyntaxStack,
};
