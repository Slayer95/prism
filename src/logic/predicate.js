"use strict";

const QuantifierBasis = {
	kNone: 0,
	kSome: 1 << 0,
	kAll: 1 << 1,
};

const Quantifier = {
	kNone: 0,
	kSome: QuantifierBasis.kSome,
	kAll: QuantifierBasis.kSome | QuantifierBasis.kAll,

	kSomeTimes: QuantifierBasis.kSome,
	kAlways: QuantifierBasis.kSome | QuantifierBasis.kAll,
};

function mergePartitionQuantifiers(quantifiers) {
	let any = false;
	let all = true;

	for (const op of quantifiers) {
		any ||= (op !== Quantifier.kNone);
		all &&= (op === Quantifier.kAll);
	}

	if (all) {
		return Quantifier.kNone;
	}
	if (any) {
		return Quantifier.kSome;
	}
	return Quantifier.kAll;
}

function isPartitionAny(quantifiers) {
	return mergePartitionQuantifiers(quantifiers) === Quantifier.kSome;
}

function isPartitionAll(quantifiers) {
	return mergePartitionQuantifiers(quantifiers) === Quantifier.kAll;
}

function isNever(quantifier) {
	return quantifier === 0;
}

function isSomeTimes(quantifier) {
	return quantifier & QuantifierBasis.kSome > 0;
}

function isAlways(quantifier) {
	return quantifier & QuantifierBasis.kSome > 0;
}

module.exports = {
	QuantifierBasis,
	Quantifier,

	isNever, isSomeTimes, isAlways,
	mergePartitionQuantifiers,

	isPartitionAny,
	isPartitionExists: isPartitionAny,
	isPartitionSome: isPartitionAny,

	isPartitionAll,
	isPartitionEvery: isPartitionAll,
	isPartitionUniversal: isPartitionAll,
};
