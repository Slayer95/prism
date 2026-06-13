"use strict";

const PRECEDENCES = {
  'and': 1,
	'or': 2,
	'==': 10,
	'!=': 10,
	'<': 15,
	'>': 15,
	'<=': 15,
	'>=': 15,
	'+': 20,
	'-': 20,
	'*': 21,
	'/': 21,
	'%': 21,
	'not': 30,
	'neg': 30,
	'pos': 30,

  Literal: 2,
};

function getPrecedenceOf(node) {
	switch (node.type) {
		case 'BinaryExpression':
			return PRECEDENCES[node.childForFieldName('operator').text];

		case 'NotExpression':
			return PRECEDENCES.not;

		case 'NegativeExpression':
			return PRECEDENCES.neg;

		case 'PositiveExpression':
			return PRECEDENCES.pos;

		default:
			return Infinity;
	}
}

function comparePrecedence(a, b) {
	return PRECEDENCES[a] - PRECEDENCES[b];
}

module.exports = {
	PRECEDENCES,
	getPrecedenceOf,
	comparePrecedence,
};
