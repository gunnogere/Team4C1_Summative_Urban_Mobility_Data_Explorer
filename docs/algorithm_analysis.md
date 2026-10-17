# Merge Sort

`algorithms/merge_sort.py` implements merge sort directly with recursion and loops. It returns a new ascending list and does not call a built-in sorting helper.

## Pseudocode

```text
MERGE-SORT(values):
	if length(values) <= 1:
		return a copy of values
	split values into left and right halves
	left_sorted = MERGE-SORT(left)
	right_sorted = MERGE-SORT(right)
	return MERGE(left_sorted, right_sorted)

MERGE(left, right):
	result = empty list
	while both lists have unconsumed values:
		append the smaller next value to result
	append the remaining values from either list
	return result
```

## Complexity

- Best, average, and worst time: $O(n \log n)$, because each recursion level processes all $n$ values and there are $\log n$ levels.
- Auxiliary space: $O(n)$ for the merged lists, plus $O(\log n)$ recursion depth.
- Stability: stable; equal values from the left half are selected first.

## Check

Run `python3 algorithms/merge_sort.py` from the repository root. The example includes duplicates and prints `[1, 3, 4, 7, 7, 9, 12]`.
