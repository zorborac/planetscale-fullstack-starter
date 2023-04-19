function toSnakeCase(str: string) {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeCaseFlatObject(obj: Record<string, unknown>) {
	const snakeCasedObject: Record<string, unknown> = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const snakeCasedKey = toSnakeCase(key);
			snakeCasedObject[snakeCasedKey] = obj[key];
		}
	}
	return snakeCasedObject;
}
