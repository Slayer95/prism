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

	kIndeterminate: 0b10,
};

function isNever(quantifier) {
	return quantifier === Quantifier.kNone;
}

function isSomeTimes(quantifier) {
	return quantifier & QuantifierBasis.kSome > 0;
}

function isAlways(quantifier) {
	return quantifier === Quantifier.kAll;
}

function toString(quantifier) {
	switch (quantifier) {
		case Quantifier.kNone: return 'none';
		case Quantifier.kSome: return 'some';
		case Quantifier.kAll: return 'all';
		case Quantifier.kIndeterminate: return 'indeterminate';
		default: return 'invalid';
	}
}

function countQuantifiers(predicates) {
	let none = 0;
	let some = 0;
	let all = 0;
	let indeterminate = 0;

	for (const q of predicates) {
		switch (q) {
			case Quantifier.kNone: ++none; break;
			case Quantifier.kSome: ++some; break;
			case Quantifier.kAll: ++all; break;
			case Quantifier.kIndeterminate: ++indeterminate; break;
		}
	}

	return { none, some, all, indeterminate };
}

// Given a predicate P, and a universe set U, split in a
// partition p1, ..., pi, such that the extent of the predicates
// over each partition is Q1, ..., Qi
//
// Take the extent Q1, ..., Qi,
// and return extent Q' for universe set.
function strictMergePartitionQuantifiers(quantifiers) {
	let any = false;
	let all = true;

	for (const op of quantifiers) {
		any ||= (op !== Quantifier.kNone);
		all &&= (op === Quantifier.kAll);
		if (op === Quantifier.kIndeterminate) {
			return Quantifier.kIndeterminate;
		}
	}

	if (all) {
		return Quantifier.kAll;
	}
	if (any) {
		return Quantifier.kSome;
	}
	return Quantifier.kNone;
}

const mergePartitionQuantifiers = {
	strict: strictMergePartitionQuantifiers,
	lower(quantifiers) {
		let any = false;
		let all = true;

		for (const op of quantifiers) {
			any ||= (op !== Quantifier.kNone && op !== Quantifier.kIndeterminate);
			all &&= (op === Quantifier.kAll);
		}

		if (all) {
			return Quantifier.kAll;
		}
		if (any) {
			return Quantifier.kSome;
		}
		return Quantifier.kNone;
	},
	upper(quantifiers) {
		let any = false;
		let all = true;

		for (const op of quantifiers) {
			any ||= (op !== Quantifier.kNone);
			all &&= (op === Quantifier.kAll || op === Quantifier.kIndeterminate);
		}

		if (all) {
			return Quantifier.kAll;
		}
		if (any) {
			return Quantifier.kSome;
		}
		return Quantifier.kNone;
	},
};

function orderReversingInvolution(quantifier) {
	// Returns a new quantifier Q', such that
	// Q(P) -> Q'(not P)
	switch (quantifier) {
		case Quantifier.kNone: return Quantifier.kAll;
		case Quantifier.kSome: return Quantifier.kSome;
		case Quantifier.kAll: return Quantifier.kNone;
		default: return quantifier;
	}
}

const predicateExtentOperators = {
	not: orderReversingInvolution,
	strict: {
		not: orderReversingInvolution,
		and(predicates) {
			const { none, some, indeterminate } = countQuantifiers(predicates);

			if (none > 0) {
				return Quantifier.kNone;
			}
			if (indeterminate > 0) {
				return Quantifier.kIndeterminate;
			}
			if (some === 0) {
				return Quantifier.kAll;
			}
			if (some === 1) {
				return Quantifier.kSome;
			}
			return Quantifier.kIndeterminate;
		},

		or(predicates) {
			const { some, all, indeterminate } = countQuantifiers(predicates);

			if (all > 0) {
				return Quantifier.kAll;
			}
			if (indeterminate > 0) {
				return Quantifier.kIndeterminate;
			}
			if (some === 0) {
				return Quantifier.kNone;
			}
			if (some === 1) {
				return Quantifier.kSome;
			}
			return Quantifier.kIndeterminate;
		},
	},
	bounded: {
		lower: {
			not(predicate) {
				// Indeterminate treated as None
				if (predicate === Quantifier.kIndeterminate) {
					return Quantifier.kNone;
				}
				return orderReversingInvolution(predicate);
			},
			and(predicates) {
				// Indeterminate treated as None
				const { none, some, indeterminate } = countQuantifiers(predicates);

				if (none + indeterminate > 0) {
					return Quantifier.kNone;
				}
				if (some === 0) {
					return Quantifier.kAll;
				}
				if (some === 1) {
					return Quantifier.kSome;
				}
				return Quantifier.kNone;
			},

			or(predicates) {
				// Indeterminate treated as None
				const { some, all } = countQuantifiers(predicates);

				if (all > 0) {
					return Quantifier.kAll;
				}
				if (some === 0) {
					return Quantifier.kNone;
				}
				return Quantifier.kSome;
			},
		},

		upper: {
			not(predicate) {
				// Indeterminate treated as All
				if (predicate === Quantifier.kIndeterminate) {
					return Quantifier.kAll;
				}
				return orderReversingInvolution(predicate);
			},
			and(predicates) {
				// Indeterminate treated as All
				const { none, some } = countQuantifiers(predicates);

				if (none > 0) {
					return Quantifier.kNone;
				}
				if (some === 0) {
					return Quantifier.kAll;
				}
				return Quantifier.kSome;
			},

			or(predicates) {
				// Indeterminate treated as All
				const { some, all, indeterminate } = countQuantifiers(predicates);

				if (all + indeterminate > 0) {
					return Quantifier.kAll;
				}
				if (some === 0) {
					return Quantifier.kNone;
				}
				if (some === 1) {
					return Quantifier.kSome;
				}
				return Quantifier.kAll;
			},
		},
	},
};

function isPartitionAny(quantifiers) {
	return isSomeTimes(mergePartitionQuantifiers.lower(quantifiers));
}

function isPartitionAll(quantifiers) {
	return isAlways(mergePartitionQuantifiers.lower(quantifiers));
}

function mayPartitionAny(quantifiers) {
	return isSomeTimes(mergePartitionQuantifiers.upper(quantifiers));
}

function mayPartitionAll(quantifiers) {
	return isAlways(mergePartitionQuantifiers.upper(quantifiers));
}

module.exports = {
	QuantifierBasis,
	Quantifier,

	toString,

	isNever, isSomeTimes, isAlways,
	mergePartitionQuantifiers,

	orderReversingInvolution,
	predicateExtentOperators,

	isPartitionAny,
	isPartitionExists: isPartitionAny,
	isPartitionSome: isPartitionAny,

	isPartitionAll,
	isPartitionEvery: isPartitionAll,
	isPartitionUniversal: isPartitionAll,

	mayPartitionAny,
	mayPartitionAll,
};
