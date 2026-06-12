"use strict";

//const assert = require('assert');

const {
	getInsideParens,
} = require('./../../lib/tree-helpers');

function extractValueNodeFromSetStatement(node /* SetStatement */) {
	return getInsideParens(node.lastNamedChild.lastNamedChild);
}

function extractValueNodeFromDeclaration(node /* GlobalDeclarationStatement | LocalDeclarationStatement */) {
	if (node.lastNamedChild.type !== 'Initializer') return null;
	return node.lastNamedChild.lastNamedChild;
}

module.exports = {
	extractValueNodeFromSetStatement,
	extractValueNodeFromDeclaration,
};
