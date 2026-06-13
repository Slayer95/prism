"use strict";

//const assert = require('assert');

const {
	getInsideParens,
	getLastSignificantChild,
} = require('./../../lib/tree-helpers');

function extractValueNodeFromSetStatement(node /* SetStatement */) {
	return getInsideParens(getLastSignificantChild(getLastSignificantChild(node).lastNamedChild));
}

function extractValueNodeFromDeclaration(node /* GlobalDeclarationStatement | LocalDeclarationStatement */) {
	const lastSignificantChild = getLastSignificantChild(node);
	if (lastSignificantChild.type !== 'Initializer') return null;
	return getLastSignificantChild(lastSignificantChild);
}

module.exports = {
	extractValueNodeFromSetStatement,
	extractValueNodeFromDeclaration,
};
