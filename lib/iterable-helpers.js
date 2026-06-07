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

module.exports = {
	Set,
};
