"use strict";

const Set = {
	getAreDisjoint(set1, set2) {
		for (const elem of set2) {
			if (set1.has(elem)) {
				return false;
			}
		}
		return true;
	},
	addMany(targetSet, iterable) {
		for (const entry of iterable) {
			targetSet.add(entry);
		}
	},
};

function* iteratePairs(iterable) {
	let prev = null, cur = null, elem;
	elem = iterable.next();
	if (elem.done) {
		// Empty
		return;
	}
	//prev = cur;
	cur = elem.value;
	elem = iterable.next();
	yield [prev, cur];
	if (elem.done) {
		yield [cur, null];
		return;
	}
	prev = cur;
	cur = elem.value;
	yield [prev, cur];
	while (!(elem = iterable.next()).done) {
		prev = cur;
		cur = elem.value;
		yield [prev, cur];
	}

	yield [cur, null];
}

function* iteratePairs2(iterable, mapFn) {
	let prev = null, cur = null, elem;
	let prevMapped = null, curMapped = null;
	elem = iterable.next();
	if (elem.done) {
		// Empty
		return;
	}
	//prev = cur;
	cur = elem.value;
	curMapped = mapFn(cur);
	elem = iterable.next();
	yield [prev, cur, prevMapped, curMapped];
	if (elem.done) {
		yield [cur, null, curMapped, null];
		return;
	}
	prev = cur;
	prevMapped = curMapped;
	cur = elem.value;
	curMapped = mapFn(cur);
	yield [prev, cur, prevMapped, curMapped];
	while (!(elem = iterable.next()).done) {
		prev = cur;
		cur = elem.value;
		curMapped = mapFn(cur);
		yield [prev, cur, prevMapped, curMapped];
	}

	yield [cur, null, curMapped, null];
}

function* iterateTriads(iterable) {
	let prev = null, cur = null, next = null, elem;
	elem = iterable.next();
	if (elem.done) {
		// Empty
		return;
	}
	cur = elem.value;
	elem = iterable.next();
	if (elem.done) {
		// One element [null, x, null]
		yield [prev, cur, next];
		return;
	}
	next = elem.value;
	yield [prev, cur, next];
	while (!(elem = iterable.next()).done) {
		prev = cur;
		cur = next;
		next = elem.value;
		yield [prev, cur, next];
	}
	yield [cur, next, null];
}

function* iterateTriads2(iterable, mapFn) {
	let prev = null, cur = null, next = null;
	let prevMapped = null, curMapped = null, nextMapped = null;
	let elem;
	elem = iterable.next();
	if (elem.done) {
		// Empty
		return;
	}
	cur = elem.value;
	curMapped = mapFn(cur);
	elem = iterable.next();
	if (elem.done) {
		// One element [null, x, null]
		yield [prev, cur, next, null, curMapped, null];
		return;
	}
	next = elem.value;
	nextMapped = mapFn(next);
	yield [prev, cur, next];
	while (!(elem = iterable.next()).done) {
		prev = cur;
		prevMapped = curMapped;
		cur = next;
		curMapped = nextMapped;
		next = elem.value;
		nextMapped = mapFn(next)
		yield [prev, cur, next, prevMapped, curMapped, nextMapped];
	}
	yield [cur, next, null, curMapped, nextMapped, null];
}

function* filterIterable(iterable, filterFn) {
	for (const elem of iterable) {
		if (filterFn(elem)) yield elem;
	}
}

module.exports = {
	Set,
	iteratePairs,
	iteratePairs2,
	iterateTriads,
	iterateTriads2,
	filterIterable,
};
