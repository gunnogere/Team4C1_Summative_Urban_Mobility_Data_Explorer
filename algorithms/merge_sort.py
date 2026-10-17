def merge_sort(values):
	"""Return a new list containing values in ascending order."""
	if len(values) <= 1:
		return list(values)

	middle = len(values) // 2
	left = merge_sort(values[:middle])
	right = merge_sort(values[middle:])
	merged = []
	left_index = 0
	right_index = 0

	while left_index < len(left) and right_index < len(right):
		if left[left_index] <= right[right_index]:
			merged.append(left[left_index])
			left_index += 1
		else:
			merged.append(right[right_index])
			right_index += 1

	merged.extend(left[left_index:])
	merged.extend(right[right_index:])
	return merged


if __name__ == "__main__":
	sample = [12, 4, 7, 3, 9, 1, 7]
	print(merge_sort(sample))
